"use client";
// T-07 (voice: always-on mic STT + streaming TTS + mute).
// T-26: suggested industry / role questions as tappable chips.
// T-31: turn-based capture (mic gated while AI speaks) to stop TTS self-echo /
//       noise being logged as the candidate's answer on speaker devices; plus
//       inline markdown rendering for chat bubbles.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { suggestedQuestionsForRole } from "@/lib/suggested-questions";
import {
  SAMPLE_WRITTEN_QUESTIONS,
  type WrittenQuestion,
} from "@/lib/written-questions";
import { QuestionCard } from "./QuestionCard";

type Speaker = "interviewer" | "trainer" | "user";
interface Msg {
  speaker: Speaker;
  text: string;
}

// Lightweight inline markdown: render **bold** as <strong> and drop the raw
// asterisks. Newlines and "- " bullets are preserved by whitespace-pre-wrap.
// No dangerouslySetInnerHTML — plain text split into React nodes.
function renderRich(text: string) {
  return text.split(/\*\*/).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>,
  );
}

// Map a stored BCP-47 primary subtag to a SpeechRecognition locale tag.
const STT_LOCALE: Record<string, string> = {
  en: "en-US",
  zh: "zh-CN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  ja: "ja-JP",
  ko: "ko-KR",
  pt: "pt-BR",
  hi: "hi-IN",
  it: "it-IT",
  ru: "ru-RU",
  ar: "ar-SA",
};
function sttLocale(code?: string): string {
  const c = (code ?? "en").toLowerCase();
  return STT_LOCALE[c] ?? STT_LOCALE[c.split("-")[0]] ?? code ?? "en-US";
}

export default function InterviewRoom({
  interviewId,
  mode,
  candidateName,
  targetRole,
  language,
  initialTurns,
}: {
  interviewId: string;
  mode: "practice" | "interview";
  candidateName: string;
  targetRole: string;
  language?: string;
  initialTurns: Msg[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialTurns);
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string>(
    initialTurns.filter((t) => t.speaker === "interviewer").at(-1)?.text ?? "",
  );
  const [activeWritten, setActiveWritten] = useState<WrittenQuestion | null>(
    null,
  );
  const [usedWrittenIds, setUsedWrittenIds] = useState<string[]>([]);

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const leavingRef = useRef(false);
  const mutedRef = useRef(muted);
  const aiSpeakingRef = useRef(aiSpeaking);
  const busyRef = useRef(busy);
  // Web Audio streaming playback (T-35, Plan A): PCM chunks are scheduled on a
  // single continuous timeline so speech is gapless within and across chunks.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartRef = useRef(0); // AudioContext-time cursor for the next buffer
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const ttsAbortRef = useRef<AbortController | null>(null);
  const drainingRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPendingRef = useRef("");
  const ttsFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSpeakRef = useRef(false);
  // Timestamp (ms) of when the AI last stopped speaking — used to keep the mic
  // gated for a short cooldown so trailing TTS echo isn't captured as an answer.
  const lastSpeakEndRef = useRef(0);
  // T-01: mic captured via getUserMedia with echo cancellation so hands-free
  // devices don't re-transcribe the AI's own TTS as the candidate's answer.
  const micStreamRef = useRef<MediaStream | null>(null);
  // T-01: accumulate the candidate's final transcript and only submit after a
  // brief silence (or an explicit "Done") — so coaching waits until they finish.
  const answerBufferRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasPendingAnswer, setHasPendingAnswer] = useState(false);
  // The always-on recognition handler is installed once (mount-only effect) and
  // would otherwise capture stale closures; these refs let it call the latest.
  const submitAnswerRef = useRef<() => void>(() => {});
  const lastQuestionRef = useRef(lastQuestion);
  // How long the candidate must pause before we treat the answer as complete.
  const SILENCE_MS = 1500;
  // Cooldown after the AI stops speaking before the mic is trusted again.
  const SPEAK_COOLDOWN_MS = 1200;

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    aiSpeakingRef.current = aiSpeaking;
  }, [aiSpeaking]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    lastQuestionRef.current = lastQuestion;
  }, [lastQuestion]);

  // ---------- TTS (streaming PCM → gapless Web Audio playback) ----------
  // Text is still batched into ~sentence chunks to keep request count low, but
  // each chunk's audio is streamed and scheduled onto one continuous timeline,
  // so playback starts at the first bytes and never stops between chunks.
  const TTS_MIN_CHUNK = 80;
  const SAMPLE_RATE = 24000; // OpenAI pcm output rate
  const SCHED_LEAD = 0.12; // seconds of head-start when (re)starting from idle
  const BLOCK_BYTES = 9600; // ~200 ms of 24 kHz 16-bit mono before scheduling

  const clearTtsFlushTimer = useCallback(() => {
    if (ttsFlushTimerRef.current) {
      clearTimeout(ttsFlushTimerRef.current);
      ttsFlushTimerRef.current = null;
    }
  }, []);

  const getAudioCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    let ctx = audioCtxRef.current;
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  }, []);

  // Schedule one block of 16-bit PCM samples at the running timeline cursor.
  const scheduleBlock = useCallback(
    (ctx: AudioContext, int16: Int16Array) => {
      if (int16.length === 0) return;
      const buf = ctx.createBuffer(1, int16.length, SAMPLE_RATE);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const now = ctx.currentTime;
      // Fresh start or underrun recovery: give a small lead so the first buffer
      // isn't scheduled in the past.
      if (nextStartRef.current < now + 0.02) nextStartRef.current = now + SCHED_LEAD;
      const startAt = nextStartRef.current;
      src.start(startAt);
      nextStartRef.current = startAt + buf.duration;
      activeSourcesRef.current.add(src);
      src.onended = () => {
        activeSourcesRef.current.delete(src);
      };
    },
    [],
  );

  // Fetch one text chunk and schedule its PCM as it streams in. Resolves once
  // the whole stream has been consumed and scheduled (not when it finishes
  // playing) so the next chunk can be fetched while this one is still audible.
  const streamChunk = useCallback(
    async (ctx: AudioContext, text: string) => {
      const ac = new AbortController();
      ttsAbortRef.current = ac;
      const res = await fetch(`/api/interview/${interviewId}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error("tts");
      const reader = res.body.getReader();
      let leftover: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (cancelSpeakRef.current) {
          await reader.cancel().catch(() => {});
          return;
        }
        let bytes: Uint8Array<ArrayBufferLike> = value;
        if (leftover.length) {
          const merged = new Uint8Array(leftover.length + value.length);
          merged.set(leftover);
          merged.set(value, leftover.length);
          bytes = merged;
          leftover = new Uint8Array(0);
        }
        if (bytes.length >= BLOCK_BYTES) {
          const usable = bytes.length - (bytes.length % 2);
          // Copy to a fresh, 2-byte-aligned buffer before the Int16 view.
          const int16 = new Int16Array(new Uint8Array(bytes.subarray(0, usable)).buffer);
          scheduleBlock(ctx, int16);
          leftover = usable < bytes.length ? bytes.slice(usable) : new Uint8Array(0);
        } else {
          leftover = bytes;
        }
      }
      if (!cancelSpeakRef.current && leftover.length >= 2) {
        const usable = leftover.length - (leftover.length % 2);
        const int16 = new Int16Array(new Uint8Array(leftover.subarray(0, usable)).buffer);
        scheduleBlock(ctx, int16);
      }
    },
    [interviewId, scheduleBlock],
  );

  const stopSpeaking = useCallback(() => {
    cancelSpeakRef.current = true;
    ttsQueueRef.current = [];
    ttsPendingRef.current = "";
    clearTtsFlushTimer();
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* noop */
      }
    }
    activeSourcesRef.current.clear();
    const ctx = audioCtxRef.current;
    if (ctx) nextStartRef.current = ctx.currentTime;
    drainingRef.current = false;
    lastSpeakEndRef.current = Date.now();
    setAiSpeaking(false);
  }, [clearTtsFlushTimer]);

  // Pull chunks off the queue and stream them back-to-back on the timeline.
  const startDrain = useCallback(async () => {
    if (drainingRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) {
      ttsQueueRef.current = [];
      return;
    }
    drainingRef.current = true;
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    setAiSpeaking(true);
    try {
      while (!cancelSpeakRef.current) {
        const next = ttsQueueRef.current.shift();
        if (!next) break;
        try {
          await streamChunk(ctx, next);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") break;
          /* one chunk failed — keep going with the rest */
        }
      }
    } finally {
      drainingRef.current = false;
      if (!cancelSpeakRef.current) {
        // Keep aiSpeaking true until the scheduled audio has actually drained.
        const remainMs = Math.max(0, (nextStartRef.current - ctx.currentTime) * 1000) + 80;
        endTimerRef.current = setTimeout(() => {
          endTimerRef.current = null;
          if (!drainingRef.current && ttsQueueRef.current.length === 0) {
            lastSpeakEndRef.current = Date.now();
            setAiSpeaking(false);
          }
        }, remainMs);
      }
    }
  }, [getAudioCtx, streamChunk]);

  const flushSpeechPending = useCallback(
    (force = false) => {
      const pending = ttsPendingRef.current.trim();
      if (!pending) return;
      if (!force && pending.length < TTS_MIN_CHUNK) return;
      ttsPendingRef.current = "";
      clearTtsFlushTimer();
      cancelSpeakRef.current = false;
      ttsQueueRef.current.push(pending);
      void startDrain();
    },
    [clearTtsFlushTimer, startDrain],
  );

  const enqueueSpeech = useCallback(
    (sentence: string) => {
      const s = sentence.trim();
      if (!s) return;
      cancelSpeakRef.current = false;
      ttsPendingRef.current = ttsPendingRef.current
        ? `${ttsPendingRef.current} ${s}`
        : s;
      if (ttsPendingRef.current.length >= TTS_MIN_CHUNK) {
        flushSpeechPending(true);
        return;
      }
      clearTtsFlushTimer();
      ttsFlushTimerRef.current = setTimeout(() => flushSpeechPending(true), 400);
    },
    [clearTtsFlushTimer, flushSpeechPending],
  );

  const finalizeSpeech = useCallback(() => {
    flushSpeechPending(true);
  }, [flushSpeechPending]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const handleFinish = useCallback(() => {
    if (finishing || leavingRef.current) return;
    leavingRef.current = true;
    setFinishing(true);
    clearSilenceTimer();
    stopSpeaking();
    chatAbortRef.current?.abort();
    setBusy(false);
    const recog = recogRef.current;
    if (recog) {
      recog.onend = null;
      try {
        recog.stop();
      } catch {
        /* not running */
      }
      try {
        recog.abort();
      } catch {
        /* already stopped */
      }
    }
    const reportUrl = `/interview/${interviewId}/report`;
    router.push(reportUrl);
    // Client navigation can stall while a chat stream is open — hard fallback.
    window.setTimeout(() => {
      if (window.location.pathname.includes("/room")) {
        window.location.assign(reportUrl);
      }
    }, 1200);
  }, [finishing, interviewId, router, stopSpeaking, clearSilenceTimer]);

  // ---------- Chat (streaming text from an agent) ----------
  const runAgent = useCallback(
    async (
      agent: "interviewer" | "trainer",
      opts: { userText?: string; question?: string; answer?: string },
    ) => {
      if (leavingRef.current) return;
      chatAbortRef.current?.abort();
      const ac = new AbortController();
      chatAbortRef.current = ac;
      setBusy(true);
      cancelSpeakRef.current = false;
      const idx = messages.length + (opts.userText ? 1 : 0);
      // optimistic: append user turn locally
      if (opts.userText) {
        setMessages((m) => [...m, { speaker: "user", text: opts.userText! }]);
      }
      setMessages((m) => [...m, { speaker: agent, text: "" }]);

      let buffer = "";
      let spokenUpTo = 0;
      try {
        const res = await fetch(`/api/interview/${interviewId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent, ...opts }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error("chat");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { speaker: agent, text: buffer };
            return copy;
          });
          // speak newly-completed sentences for low latency
          const match = buffer.slice(spokenUpTo).match(/[^.!?]+[.!?]+/g);
          if (match) {
            for (const sentence of match) enqueueSpeech(sentence);
            spokenUpTo += match.join("").length;
          }
        }
        // speak any trailing text
        const tail = buffer.slice(spokenUpTo).trim();
        if (tail) enqueueSpeech(tail);
        finalizeSpeech();
        if (agent === "interviewer") setLastQuestion(buffer);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            speaker: agent,
            text: "[connection error — check AI key / try again]",
          };
          return copy;
        });
      } finally {
        if (chatAbortRef.current === ac) chatAbortRef.current = null;
        setBusy(false);
      }
      void idx;
    },
    [interviewId, messages.length, enqueueSpeech, finalizeSpeech],
  );

  const handleUserUtterance = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busyRef.current) return;
      if (mode === "practice") {
        // Trainer coaches the latest answer to the last interviewer question.
        // Read the question from a ref so the mount-time recognition handler
        // always coaches against the CURRENT question, not a stale one.
        void runAgent("trainer", {
          question: lastQuestionRef.current,
          answer: t,
          userText: t,
        });
      } else {
        void runAgent("interviewer", { userText: t });
      }
    },
    [mode, runAgent],
  );

  // T-01: submit whatever the candidate has said so far (silence-triggered or
  // via the explicit "Done" button). Coaching only fires here, never mid-answer.
  const submitBufferedAnswer = useCallback(() => {
    clearSilenceTimer();
    const answer = answerBufferRef.current.trim();
    answerBufferRef.current = "";
    setHasPendingAnswer(false);
    setInterim("");
    if (!answer || busyRef.current) return;
    handleUserUtterance(answer);
  }, [clearSilenceTimer, handleUserUtterance]);

  // Keep the ref pointed at the latest submit fn for the mount-only recognizer.
  useEffect(() => {
    submitAnswerRef.current = submitBufferedAnswer;
  }, [submitBufferedAnswer]);

  const suggestions = useMemo(
    () => suggestedQuestionsForRole(targetRole),
    [targetRole],
  );
  const [usedSuggestionIds, setUsedSuggestionIds] = useState<string[]>([]);

  const askSuggested = useCallback(
    async (id: string, question: string) => {
      if (busyRef.current) return;
      setUsedSuggestionIds((prev) =>
        prev.includes(id) ? prev : [...prev, id],
      );
      setBusy(true);
      cancelSpeakRef.current = false;
      setMessages((m) => [...m, { speaker: "interviewer", text: question }]);
      setLastQuestion(question);
      enqueueSpeech(question);
      finalizeSpeech();
      try {
        await fetch(`/api/interview/${interviewId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: "interviewer", presetQuestion: question }),
        });
      } catch {
        /* local bubble already shown */
      } finally {
        setBusy(false);
      }
    },
    [interviewId, enqueueSpeech, finalizeSpeech],
  );

  const openWrittenQuestion = useCallback((q: WrittenQuestion) => {
    if (busyRef.current) return;
    setUsedWrittenIds((prev) => (prev.includes(q.id) ? prev : [...prev, q.id]));
    setActiveWritten(q);
    setLastQuestion(q.prompt);
    setMessages((m) => [
      ...m,
      {
        speaker: "interviewer",
        text: `[Written ${q.kind}] ${q.prompt}`,
      },
    ]);
  }, []);

  const submitWritten = useCallback(
    (utterance: string) => {
      setActiveWritten(null);
      handleUserUtterance(utterance);
    },
    [handleUserUtterance],
  );

  // ---------- Mic capture with echo cancellation (T-01) ----------
  // The browser SpeechRecognition API opens its own capture, but holding an
  // getUserMedia stream with echoCancellation/noiseSuppression/autoGainControl
  // makes the platform apply AEC to the shared input device, so on hands-free
  // (speaker) setups the AI's own TTS is largely cancelled before it can be
  // transcribed back as the candidate's answer. Also front-loads the mic prompt.
  useEffect(() => {
    let cancelled = false;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) return;
    md.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
      })
      .catch(() => {
        /* permission denied / no device — SpeechRecognition still tries */
      });
    return () => {
      cancelled = true;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    };
  }, []);

  // ---------- Speech recognition (always-on mic) ----------
  useEffect(() => {
    const Ctor =
      typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;
    if (!Ctor) return;
    const recog = new Ctor();
    // T-05: recognize in the interview's language (detected from the résumé),
    // not a hard-coded en-US. `language` is stable for the session.
    recog.lang = sttLocale(language);
    recog.continuous = true;
    recog.interimResults = true;
    recogRef.current = recog;

    recog.onresult = (e) => {
      if (mutedRef.current) return;
      // Turn-based capture. On speaker devices (no headphones) the mic hears the
      // AI's own TTS and room noise; without acoustic echo cancellation the
      // browser can't tell them from the candidate, so those got transcribed as
      // the user's answer. Ignore the mic entirely while the AI is speaking,
      // while a response is being generated, and for a short cooldown after TTS
      // ends — then listen for the real answer.
      if (
        aiSpeakingRef.current ||
        busyRef.current ||
        Date.now() - lastSpeakEndRef.current < SPEAK_COOLDOWN_MS
      ) {
        setInterim("");
        return;
      }
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const piece = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += piece;
        else interimText += piece;
      }
      setInterim(interimText);
      // T-01: accumulate final speech into a buffer and DON'T submit yet — the
      // candidate is often mid-answer. Any incoming speech (final or interim)
      // resets a short silence timer; only when they pause for SILENCE_MS (or
      // press "Done") do we treat the answer as complete and coach on it. This
      // stops the Trainer/interviewer from interrupting halfway through.
      const finalTrim = finalText.trim();
      if (finalTrim) {
        answerBufferRef.current = answerBufferRef.current
          ? `${answerBufferRef.current} ${finalTrim}`
          : finalTrim;
        setHasPendingAnswer(true);
      }
      // Reset the silence timer on any voice activity (spoken words in progress).
      if (finalTrim || interimText.trim()) {
        clearSilenceTimer();
        if (answerBufferRef.current.trim()) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            // Re-check gates at fire time: never submit while the AI is talking.
            if (aiSpeakingRef.current || busyRef.current) return;
            submitAnswerRef.current();
          }, SILENCE_MS);
        }
      }
    };
    recog.onend = () => {
      setListening(false);
      if (leavingRef.current) return;
      // auto-restart unless muted (keeps the mic always-on)
      if (!mutedRef.current) {
        try {
          recog.start();
          setListening(true);
        } catch {
          /* already started */
        }
      }
    };
    recog.onerror = () => {};

    try {
      recog.start();
      setListening(true);
    } catch {
      /* ignore */
    }
    return () => {
      recog.onend = null;
      recog.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mute toggles capture without tearing down recognition.
  const toggleMute = () => {
    const recog = recogRef.current;
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        // Muting discards any half-captured answer so it can't submit later.
        clearSilenceTimer();
        answerBufferRef.current = "";
        setHasPendingAnswer(false);
        setInterim("");
      }
      if (recog) {
        if (next) recog.stop();
        else {
          try {
            recog.start();
            setListening(true);
          } catch {
            /* already running */
          }
        }
      }
      return next;
    });
  };

  // Interviewer asks the first question on load (interview mode, empty transcript).
  useEffect(() => {
    if (messages.length === 0) void runAgent("interviewer", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobile browsers keep a new AudioContext suspended until a user gesture.
  // Resume it on the first tap/keypress, and tear the context down on unmount.
  useEffect(() => {
    const resume = () => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      clearSilenceTimer();
      stopSpeaking();
      const ctx = audioCtxRef.current;
      if (ctx) {
        void ctx.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  return (
    <div className="safe-pt safe-px mx-auto flex h-dvh max-w-3xl flex-col px-3 sm:px-4">
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold sm:text-lg">
            {mode === "practice" ? "Practice" : "Interview"} · {targetRole}
          </h1>
          <p className="truncate text-xs text-gray-500">
            {candidateName} ·{" "}
            {aiSpeaking
              ? "AI speaking…"
              : listening && !muted
                ? "listening…"
                : muted
                  ? "muted"
                  : "idle"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-medium sm:flex-none ${
              muted ? "bg-red-600 text-white" : "border border-gray-300"
            }`}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            disabled={finishing}
            onClick={handleFinish}
            className="min-h-11 flex-1 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 sm:flex-none"
          >
            {finishing ? "Finishing…" : "Finish"}
          </button>
        </div>
      </header>

      {!supported && (
        <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          This browser doesn’t support speech recognition — use Chrome, or type
          your answers below. (Headphones recommended so the mic doesn’t hear the
          AI.)
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.speaker === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[min(85%,24rem)] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[80%] sm:px-4 ${
                m.speaker === "user"
                  ? "bg-indigo-600 text-white"
                  : m.speaker === "trainer"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-gray-100 text-gray-900"
              }`}
            >
              <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-60">
                {m.speaker}
              </div>
              {m.text ? renderRich(m.text) : "…"}
            </div>
          </div>
        ))}
        {(hasPendingAnswer || interim) && (
          <div className="flex flex-col items-end gap-2">
            <div className="max-w-[min(85%,24rem)] break-words rounded-2xl bg-indigo-600/40 px-3.5 py-2.5 text-sm text-white sm:max-w-[80%] sm:px-4">
              {answerBufferRef.current
                ? `${answerBufferRef.current}${interim ? " " + interim : ""}`
                : interim}
            </div>
            {hasPendingAnswer && !busy && (
              <button
                type="button"
                onClick={submitBufferedAnswer}
                className="min-h-9 rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white"
              >
                Done answering ↵
              </button>
            )}
          </div>
        )}
        {activeWritten ? (
          <div className="flex justify-start">
            <QuestionCard
              key={activeWritten.id}
              interviewId={interviewId}
              question={activeWritten}
              disabled={busy}
              onSubmit={(utterance) => submitWritten(utterance)}
            />
          </div>
        ) : null}
      </div>

      <TypeFallback
        onSend={handleUserUtterance}
        disabled={busy}
        mode={mode}
        suggestions={suggestions.filter((s) => !usedSuggestionIds.includes(s.id))}
        onSuggest={(id, q) => void askSuggested(id, q)}
        writtenQuestions={SAMPLE_WRITTEN_QUESTIONS.filter(
          (q) => !usedWrittenIds.includes(q.id),
        )}
        onWritten={openWrittenQuestion}
      />
    </div>
  );
}

function TypeFallback({
  onSend,
  disabled,
  mode,
  suggestions,
  onSuggest,
  writtenQuestions,
  onWritten,
}: {
  onSend: (t: string) => void;
  disabled: boolean;
  mode: string;
  suggestions: { id: string; label: string; question: string }[];
  onSuggest: (id: string, question: string) => void;
  writtenQuestions: WrittenQuestion[];
  onWritten: (q: WrittenQuestion) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="safe-pb border-t border-gray-200 bg-[#f6f5f0] pt-3">
      {writtenQuestions.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Written questions
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {writtenQuestions.map((q) => (
              <button
                key={q.id}
                type="button"
                disabled={disabled}
                title={q.prompt}
                onClick={() => onWritten(q)}
                className="min-h-10 shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-left text-xs font-medium text-indigo-900 disabled:opacity-40"
              >
                {q.kind === "coding"
                  ? `Code · ${q.language ?? "code"}`
                  : q.options?.some((o) => o.imageUrl)
                    ? "Graphic choice"
                    : q.kind === "multi_choice"
                      ? "Multi-choice"
                      : "Single choice"}
              </button>
            ))}
          </div>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Suggested questions
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                title={s.question}
                onClick={() => onSuggest(s.id, s.question)}
                className="min-h-10 shrink-0 rounded-full border border-[#17201e]/15 bg-white px-3.5 py-2 text-left text-xs font-medium text-[#17201e] disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (val.trim()) {
            onSend(val);
            setVal("");
          }
        }}
      >
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={
            mode === "practice"
              ? "Type your answer…"
              : "Speak, or type…"
          }
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base sm:text-sm"
        />
        <button
          type="submit"
          disabled={disabled}
          className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
