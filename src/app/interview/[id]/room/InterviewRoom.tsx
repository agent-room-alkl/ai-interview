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
import type { ExpressionLevel } from "@/lib/interview-engine";
import { QuestionCard } from "./QuestionCard";
import { SpeakerAvatar } from "./SpeakerAvatar";
import { SpeakingIndicator } from "./SpeakingIndicator";

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

// Mobile browsers (esp. Android Chrome) give SpeechRecognition exclusive use of
// the microphone: a simultaneously-held getUserMedia track blocks recognition
// from ever acquiring the mic. Detect mobile so we can release that stream and
// let recognition own the input device.
function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// Fold a new transcript fragment onto the accumulated text without duplicating.
// Android Chrome's continuous SpeechRecognition re-emits an ever-growing
// restatement of the same utterance on each event (and keeps resultIndex at 0),
// so blindly appending pieces produces runaway repetition like
// "do you remember do you remember experience do you remember experience the…".
// Here: an empty/duplicate piece is dropped, a piece that extends the accumulator
// (the growing-restatement case) replaces it, one already contained is ignored,
// and a genuinely new segment is appended with a space. Case-insensitive so a
// capitalized restart still matches.
function mergeTranscript(acc: string, piece: string): string {
  const p = piece.trim();
  if (!p) return acc;
  if (!acc) return p;
  const a = acc.toLowerCase();
  const b = p.toLowerCase();
  if (a === b) return acc;
  if (b.startsWith(a)) return p; // growing restatement of the same utterance
  if (a.endsWith(b)) return acc; // already folded in
  if (b.endsWith(a)) return p; // rare: prefix re-recognized
  return `${acc} ${p}`;
}

function toWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// The mic stays always-on, so while the AI is talking a speaker (no headphones)
// setup will transcribe the AI's own TTS. Treat a captured phrase as echo — not
// the candidate — when most of its words appear in what the AI is currently
// saying. Real barge-in (the candidate talking over the AI about something else)
// shares few words and passes through. Headphone users never hit this at all.
function isLikelyEcho(candidate: string, aiSpoken: string): boolean {
  const words = toWords(candidate);
  if (words.length === 0) return true;
  if (!aiSpoken) return false;
  const aiSet = new Set(toWords(aiSpoken));
  if (aiSet.size === 0) return false;
  const overlap = words.filter((w) => aiSet.has(w)).length / words.length;
  return overlap >= 0.7;
}

// T-13: the interviewer embeds [[ASK_WRITTEN:<id>]] to pose a written test.
const WRITTEN_MARKER = /\[\[ASK_WRITTEN:([a-z0-9_-]+)\]\]/gi;
const stripMarkers = (s: string) =>
  s.replace(WRITTEN_MARKER, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
// T-12: a practice answer must reach this score (0–100) to move on.
const PASS_THRESHOLD = 80;
// Parse "**Score:** NN/100" out of a trainer message.
function parseScore(text: string): number | null {
  const m = text.match(/score[^0-9]{0,12}(\d{1,3})\s*\/\s*100/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

// T-18: filler / acknowledgement words that, on their own, aren't a real answer.
const FILLER_WORDS = new Set([
  "ok", "okay", "kay", "yeah", "yea", "yep", "yup", "yes", "no", "nope", "nah",
  "um", "umm", "uh", "uhh", "er", "erm", "hmm", "hm", "mm", "mmm", "mhm",
  "hi", "hello", "hey", "sure", "right", "cool", "nice", "thanks", "huh", "what",
]);
// True when the captured text is empty, noise, or only filler — i.e. the
// candidate didn't really answer, so we should ask them to say it again rather
// than score/coach it.
function isTrivialAnswer(text: string): boolean {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:…'"—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return true;
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 0) return true;
  if (words.every((w) => FILLER_WORDS.has(w))) return true;
  if (words.length === 1 && cleaned.length <= 3) return true;
  return false;
}

export default function InterviewRoom({
  interviewId,
  mode,
  candidateName,
  candidateImageUrl,
  targetRole,
  language,
  initialTurns,
}: {
  interviewId: string;
  mode: "practice" | "interview";
  candidateName: string;
  candidateImageUrl?: string | null;
  targetRole: string;
  language?: string;
  initialTurns: Msg[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialTurns);
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  // Surfaced when the mic can't be acquired (permission blocked, no device, or
  // in use elsewhere) so mobile users aren't left staring at a dead mic.
  const [micError, setMicError] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [speakingAgent, setSpeakingAgent] = useState<
    "interviewer" | "trainer" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string>(
    initialTurns.filter((t) => t.speaker === "interviewer").at(-1)?.text ?? "",
  );
  const [activeWritten, setActiveWritten] = useState<WrittenQuestion | null>(
    null,
  );
  const [usedWrittenIds, setUsedWrittenIds] = useState<string[]>([]);
  // T-12: last trainer score (practice mode); gates progressing to the next Q.
  const [lastScore, setLastScore] = useState<number | null>(null);
  // T-34 / T-20: keep the graded transcript so the candidate can edit ASR text
  // and re-score without re-speaking.
  const [lastGradedTranscript, setLastGradedTranscript] = useState("");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  // T-23: logged-in sessions have a persistent ten-minute deadline. The
  // deadline is stored per interview so a refresh/reconnect cannot reset it.
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  const deadlineKey = `interview:${interviewId}:deadline`;
  // T-14: how elaborate the AI's language is (selectable + switchable). A ref
  // mirrors it so the mount-only recognition path sends the current level too.
  const [expressionLevel, setExpressionLevel] =
    useState<ExpressionLevel>("professional");
  const expressionLevelRef = useRef<ExpressionLevel>(expressionLevel);

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  // Set on a fatal recognition error (permission denied) so onend stops the
  // auto-restart loop instead of hammering the mic. Cleared on a user gesture.
  const recogFatalRef = useRef(false);
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
  // Split the pending answer into text committed from PREVIOUS recognition
  // sessions (before an onend/restart) and the CURRENT session's final text.
  // The current session is rebuilt from results[0..] each event rather than
  // appended, so Android's cumulative re-emits can't pile up (see mergeTranscript).
  const committedRef = useRef("");
  const sessionFinalRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasPendingAnswer, setHasPendingAnswer] = useState(false);
  // The always-on recognition handler is installed once (mount-only effect) and
  // would otherwise capture stale closures; these refs let it call the latest.
  const submitAnswerRef = useRef<() => void>(() => {});
  const lastQuestionRef = useRef(lastQuestion);
  // What the AI is currently saying (updated as its reply streams). Used to
  // reject the AI's own voice echoing back into the always-on mic on speaker
  // setups, and to tell real barge-in from echo.
  const aiUtteranceRef = useRef("");
  // Lets the mount-only recognizer stop the AI's TTS for barge-in without
  // capturing a stale stopSpeaking closure.
  const stopSpeakingRef = useRef<() => void>(() => {});
  // T-28: silence window tuned to reduce room-noise false submits without
  // swallowing short but real answers (pair with energy VAD + tip banner).
  const SILENCE_MS = 1800;
  // RMS below this (0–1 float) is treated as ambient noise, not speech.
  const MIC_ENERGY_FLOOR = 0.012;
  const micRmsRef = useRef(0);
  const vadActiveRef = useRef(false);
  const vadCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);

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
  useEffect(() => {
    expressionLevelRef.current = expressionLevel;
  }, [expressionLevel]);

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
    aiUtteranceRef.current = "";
    setAiSpeaking(false);
    setSpeakingAgent(null);
  }, [clearTtsFlushTimer]);

  // Keep a live handle to stopSpeaking for the mount-only recognizer (barge-in).
  useEffect(() => {
    stopSpeakingRef.current = stopSpeaking;
  }, [stopSpeaking]);

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
            setSpeakingAgent(null);
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

  // T-23: initialize once from a persisted absolute deadline, then tick from
  // Date.now() so tab throttling does not make the countdown drift.
  useEffect(() => {
    const now = Date.now();
    const stored = window.localStorage.getItem(deadlineKey);
    const parsed = stored ? Number(stored) : NaN;
    const deadline = Number.isFinite(parsed) && parsed > now ? parsed : now + 10 * 60 * 1000;
    window.localStorage.setItem(deadlineKey, String(deadline));
    let finished = false;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !finished) {
        finished = true;
        window.localStorage.removeItem(deadlineKey);
        setTimeExpired(true);
        window.clearInterval(timer);
        window.setTimeout(handleFinish, 1000);
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineKey, handleFinish]);

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
      setSpeakingAgent(agent);
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
          body: JSON.stringify({
            agent,
            expressionLevel: expressionLevelRef.current,
            ...opts,
          }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error("chat");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Track what the AI is saying so the always-on mic can reject its own
          // TTS echoing back (speaker setups) instead of logging it as an answer.
          aiUtteranceRef.current = stripMarkers(buffer);
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { speaker: agent, text: stripMarkers(buffer) };
            return copy;
          });
          // speak newly-completed sentences for low latency (markers never spoken)
          const match = buffer.slice(spokenUpTo).match(/[^.!?]+[.!?]+/g);
          if (match) {
            for (const sentence of match) {
              const clean = stripMarkers(sentence);
              if (clean) enqueueSpeech(clean);
            }
            spokenUpTo += match.join("").length;
          }
        }
        // speak any trailing text (minus control markers)
        const tail = stripMarkers(buffer.slice(spokenUpTo));
        if (tail) enqueueSpeech(tail);
        finalizeSpeech();
        // Ensure the final rendered bubble carries no control markers.
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { speaker: agent, text: stripMarkers(buffer) };
          return copy;
        });
        if (agent === "interviewer") {
          setLastQuestion(stripMarkers(buffer));
          // T-13: interviewer decided to pose a written test question.
          const wm = buffer.match(WRITTEN_MARKER);
          const id = wm ? /ASK_WRITTEN:([a-z0-9_-]+)/i.exec(wm[0])?.[1] : null;
          const q = id ? SAMPLE_WRITTEN_QUESTIONS.find((x) => x.id === id) : null;
          if (q) {
            setUsedWrittenIds((prev) =>
              prev.includes(q.id) ? prev : [...prev, q.id],
            );
            setLastQuestion(q.prompt);
            setActiveWritten(q);
          }
        } else if (agent === "trainer" && mode === "practice") {
          // T-12: score gates progressing to the next question.
          setLastScore(parseScore(buffer));
        }
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
    [interviewId, messages.length, mode, enqueueSpeech, finalizeSpeech],
  );

  // T-12: clear the score gate whenever the candidate starts a fresh answer,
  // and let them advance to the next interviewer question once they've passed.
  const continueToNextQuestion = useCallback(() => {
    if (busyRef.current) return;
    setLastScore(null);
    setLastGradedTranscript("");
    setEditingTranscript(false);
    setTranscriptDraft("");
    void runAgent("interviewer", {});
  }, [runAgent]);

  const handleUserUtterance = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busyRef.current) return;
      setLastScore(null); // T-12: reset the gate for this new attempt
      setEditingTranscript(false);
      setTranscriptDraft("");
      // T-18: empty / noise / filler-only capture — don't score it, just show
      // what was heard and ask the candidate to say it again.
      if (isTrivialAnswer(t)) {
        const nudge = "I didn't catch a clear answer — please say it again.";
        const who: Speaker = mode === "practice" ? "trainer" : "interviewer";
        setMessages((m) => [
          ...m,
          { speaker: "user", text: t },
          { speaker: who, text: nudge },
        ]);
        cancelSpeakRef.current = false;
        aiUtteranceRef.current = nudge;
        setSpeakingAgent(who);
        enqueueSpeech(nudge);
        finalizeSpeech();
        return;
      }
      if (mode === "practice") {
        // T-34: remember what was graded so Edit transcript can fix ASR.
        setLastGradedTranscript(t);
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
    [mode, runAgent, enqueueSpeech, finalizeSpeech],
  );

  const openEditTranscript = useCallback(() => {
    setTranscriptDraft(lastGradedTranscript);
    setEditingTranscript(true);
  }, [lastGradedTranscript]);

  const submitEditedTranscript = useCallback(() => {
    const next = transcriptDraft.trim();
    if (!next || busyRef.current) return;
    setEditingTranscript(false);
    handleUserUtterance(next);
  }, [transcriptDraft, handleUserUtterance]);

  // T-01: submit whatever the candidate has said so far (silence-triggered or
  // via the explicit "Done" button). Coaching only fires here, never mid-answer.
  const submitBufferedAnswer = useCallback(() => {
    clearSilenceTimer();
    const answer = answerBufferRef.current.trim();
    answerBufferRef.current = "";
    committedRef.current = "";
    sessionFinalRef.current = "";
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
      aiUtteranceRef.current = question;
      setSpeakingAgent("interviewer");
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

  // ---------- Mic capture with echo cancellation (T-01) + energy VAD (T-28) ----------
  // The browser SpeechRecognition API opens its own capture, but holding an
  // getUserMedia stream with echoCancellation/noiseSuppression/autoGainControl
  // makes the platform apply AEC to the shared input device, so on hands-free
  // (speaker) setups the AI's own TTS is largely cancelled before it can be
  // transcribed back as the candidate's answer. Also front-loads the mic prompt.
  // T-28: AnalyserNode RMS gates low-energy ambient noise out of the buffer.
  useEffect(() => {
    let cancelled = false;
    let localCtx: AudioContext | null = null;
    const mobile = isMobileUA();
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
        // Mobile: SpeechRecognition needs exclusive mic access, so a persistent
        // getUserMedia track blocks it from ever hearing the candidate. Use this
        // call only to front-load the permission prompt, then release the stream
        // immediately and let recognition own the mic. (Turn-based capture + the
        // headphones tip cover echo; the energy VAD fails open when absent.)
        if (mobile) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        try {
          const AC =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (!AC) return;
          localCtx = new AC();
          vadCtxRef.current = localCtx;
          if (localCtx.state === "suspended") void localCtx.resume().catch(() => {});
          const source = localCtx.createMediaStreamSource(stream);
          const analyser = localCtx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          const data = new Uint8Array(analyser.fftSize);
          const tick = () => {
            if (cancelled) return;
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            micRmsRef.current = Math.sqrt(sum / data.length);
            vadActiveRef.current = true;
            vadRafRef.current = requestAnimationFrame(tick);
          };
          vadRafRef.current = requestAnimationFrame(tick);
        } catch {
          /* Analyser unavailable — recognition still works without energy gate */
        }
      })
      .catch((err: unknown) => {
        // Permission denied / no device. On mobile this is the likely reason
        // the mic "doesn't work" — surface it instead of failing silently.
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setMicError(
            "Microphone access was blocked. Allow the mic for this site in your browser settings, then reload — or type your answers below.",
          );
        } else if (name === "NotFoundError" || name === "NotReadableError") {
          setMicError(
            "No microphone was found or it's in use by another app. Free it up, or type your answers below.",
          );
        }
        /* SpeechRecognition still tries; the banner tells the user what to do. */
      });
    return () => {
      cancelled = true;
      if (vadRafRef.current != null) cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      if (localCtx) void localCtx.close().catch(() => {});
      vadCtxRef.current = null;
      vadActiveRef.current = false;
      micRmsRef.current = 0;
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
    const mobile = isMobileUA();
    // T-05: recognize in the interview's language (detected from the résumé),
    // not a hard-coded en-US. `language` is stable for the session.
    recog.lang = sttLocale(language);
    // Android Chrome's *continuous* recognition is the source of the runaway
    // duplication: it never advances resultIndex and keeps re-emitting fluctuating
    // re-recognitions of the same utterance ("…migration project" / "…projects" /
    // "…migration") as fresh finals, which pile up. One-shot sessions (restarted
    // in onend) give one clean utterance per session instead. Desktop Chrome has
    // no such bug and benefits from a single always-on continuous session.
    recog.continuous = !mobile;
    recog.interimResults = true;
    recogRef.current = recog;

    recog.onresult = (e) => {
      if (mutedRef.current) return;
      // Always-on mic: the recognizer keeps listening even while the AI talks,
      // so the candidate can speak (and barge in) at any time. The old design
      // hard-paused capture during AI speech; instead we now keep listening and,
      // below, reject the AI's own TTS echoing back on speaker setups by matching
      // it against what the AI is currently saying.
      // Rebuild this recognition session's final text from the WHOLE results
      // list every event (results[] is the authoritative cumulative record)
      // rather than appending the delta from e.resultIndex (Android keeps that
      // at 0, so appending double-counts). How finals are folded depends on the
      // platform: mobile is a one-shot session covering a SINGLE utterance that
      // Android re-emits as fluctuating variants, so keep the single longest
      // final; desktop's continuous session strings together distinct segments,
      // so merge them in order.
      let sessionFinal = "";
      let interimText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const alt = r[0];
        const piece = alt?.transcript ?? "";
        // T-28: drop low-confidence finals when the engine reports confidence
        // (Chrome often leaves it at 0 in continuous mode — only filter when >0).
        const conf = alt?.confidence;
        if (
          r.isFinal &&
          typeof conf === "number" &&
          conf > 0 &&
          conf < 0.4
        ) {
          continue;
        }
        if (r.isFinal) {
          const p = piece.trim();
          sessionFinal = mobile
            ? p.length > sessionFinal.length
              ? p
              : sessionFinal
            : mergeTranscript(sessionFinal, piece);
        } else interimText += piece;
      }
      const sessionTrim = sessionFinal.trim();
      // While the AI is speaking, decide whether what we heard is the AI's own
      // voice bleeding back in (speaker setups) or the candidate barging in.
      // If most words match what the AI is saying, it's echo — drop it and don't
      // touch the answer buffer. Otherwise the candidate is talking over the AI,
      // so cut the AI's TTS immediately and capture their words.
      if (aiSpeakingRef.current) {
        const heard = sessionTrim || interimText.trim();
        // Drop the AI's own echo, and ignore short blips (a cough, a stray
        // filler) so they don't cut the AI off — only a few real, non-matching
        // words count as the candidate barging in. results[] is cumulative, so
        // once the threshold is crossed the whole phrase is still captured below.
        if (
          toWords(heard).length < 3 ||
          isLikelyEcho(heard, aiUtteranceRef.current)
        ) {
          setInterim("");
          return;
        }
        stopSpeakingRef.current();
      }
      setInterim(interimText);
      // T-01: accumulate final speech into a buffer and DON'T submit yet — the
      // candidate is often mid-answer. Any incoming speech (final or interim)
      // resets a short silence timer; only when they pause for SILENCE_MS (or
      // press "Done") do we treat the answer as complete and coach on it. This
      // stops the Trainer/interviewer from interrupting halfway through.
      // T-28: ignore finals while mic energy is below ambient floor (room noise).
      // Fail-open when VAD isn't reporting yet (mobile AudioContext often stays
      // suspended until a user gesture — RMS stays 0 and would block all speech).
      const energyOk =
        !vadActiveRef.current || micRmsRef.current >= MIC_ENERGY_FLOOR;
      if (sessionTrim && energyOk) {
        sessionFinalRef.current = sessionTrim;
        // Pending answer = committed prior sessions + the rebuilt current one.
        answerBufferRef.current = mergeTranscript(
          committedRef.current,
          sessionTrim,
        );
        setHasPendingAnswer(Boolean(answerBufferRef.current));
      }
      // Reset the silence timer on any voice activity (spoken words in progress).
      if (sessionTrim || interimText.trim()) {
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
      // Recognition restarts with a fresh results[] list, so fold this session's
      // final text into the committed buffer before it resets — otherwise the
      // next session's rebuild would drop everything said before the restart.
      if (sessionFinalRef.current) {
        committedRef.current = mergeTranscript(
          committedRef.current,
          sessionFinalRef.current,
        );
        sessionFinalRef.current = "";
      }
      // A fatal error (permission blocked) stops the restart loop — otherwise we
      // hammer the mic and spin forever. A tap re-arms it (see gesture handler).
      if (leavingRef.current || recogFatalRef.current) return;
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
    recog.onstart = () => {
      // Mic acquired successfully — clear any stale error banner.
      recogFatalRef.current = false;
      setMicError(null);
    };
    recog.onerror = (e) => {
      const err = (e as unknown as { error?: string }).error ?? "";
      if (err === "not-allowed" || err === "service-not-allowed") {
        // Permission denied or blocked by policy — fatal until re-granted.
        recogFatalRef.current = true;
        setListening(false);
        setMicError(
          "Microphone access is blocked. Allow the mic for this site in your browser settings, then reload — or type your answers below.",
        );
      } else if (err === "audio-capture") {
        setMicError(
          "No microphone was found or it's in use by another app. Free it up, or type your answers below.",
        );
      }
      /* no-speech / aborted / network are recoverable — onend restarts. */
    };

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
        committedRef.current = "";
        sessionFinalRef.current = "";
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
      const vad = vadCtxRef.current;
      if (vad && vad.state === "suspended") void vad.resume().catch(() => {});
      // iOS Safari blocks SpeechRecognition until a user gesture — retry start.
      // A tap is also the user's chance to recover after they've (re)granted the
      // mic, so clear the fatal flag and attempt one fresh start.
      const recog = recogRef.current;
      if (recog && !mutedRef.current && !listening) {
        recogFatalRef.current = false;
        try {
          recog.start();
          setListening(true);
        } catch {
          /* already running */
        }
      }
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
    <div className="safe-pt safe-px mx-auto flex h-dvh w-full max-w-6xl flex-col px-3 sm:px-6 lg:max-w-7xl lg:px-10">
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-3 pt-1 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            {mode === "practice" ? "Practice room" : "Interview room"}
          </p>
          <h1 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em] sm:text-2xl">
            {targetRole}
          </h1>
          <p className="mt-0.5 truncate text-xs text-gray-500 sm:text-sm">
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {timeLeft !== null && (
            <div
              aria-label={`Time remaining ${Math.floor(timeLeft / 60)} minutes ${timeLeft % 60} seconds`}
              className={`min-w-[5.5rem] rounded-xl border px-3 py-2 text-center text-xs font-semibold tabular-nums ${
                timeLeft <= 60
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-gray-200 bg-gray-50 text-gray-700"
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wide opacity-70">Time left</span>
              <span className="text-sm">{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}</span>
            </div>
          )}
          <button
            type="button"
            onClick={toggleMute}
            className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-medium sm:flex-none sm:px-5 ${
              muted ? "bg-red-600 text-white" : "border border-gray-300"
            }`}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            disabled={finishing}
            onClick={handleFinish}
            className="min-h-11 flex-1 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 sm:flex-none sm:px-5"
          >
            {finishing ? "Finishing…" : "Finish"}
          </button>
        </div>
      </header>

      {timeExpired && (
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          Time limit reached — finishing this interview safely.
        </div>
      )}

      {/* T-14/T-19: expression level — how elaborate the AI talks (not role
          difficulty). Kept OUTSIDE the scrolling transcript so it stays visible
          at the top; selectable at the start and switchable mid-interview
          (next turn applies). Styled as a distinct control bar so it reads as
          an operable control rather than faint caption text. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 sm:px-4">
        <label
          htmlFor="expr-level"
          className="text-xs font-semibold uppercase tracking-wide text-gray-700"
        >
          Expression level
        </label>
        <select
          id="expr-level"
          value={expressionLevel}
          onChange={(e) => setExpressionLevel(e.target.value as ExpressionLevel)}
          className="min-h-9 w-full rounded-lg border border-gray-400 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-900 shadow-sm sm:w-auto sm:min-w-[18rem]"
        >
          <option value="clear">Clear · plain words, short sentences</option>
          <option value="professional">Professional · standard workplace tone</option>
          <option value="advanced">Advanced · domain terms &amp; depth</option>
          <option value="expert">Expert · dense &amp; rigorous</option>
        </select>
        <span className="w-full text-xs text-gray-500 sm:w-auto">
          Changes how elaborate the AI talks — not the role difficulty
        </span>
      </div>

      {/* T-28: quiet-room / headphones tip — ambient noise is the #1 false-capture source. */}
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Find a quiet place to practice. Headphones recommended so the mic doesn&apos;t
        pick up the AI or room noise.
      </p>

      {!supported && (
        <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          This browser doesn’t support speech recognition — use Chrome, or type
          your answers below. (Headphones recommended so the mic doesn’t hear the
          AI.)
        </div>
      )}

      {micError && (
        <div
          role="alert"
          className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
        >
          {micError}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-4 sm:space-y-5 sm:py-6">
        {messages.map((m, i) => {
          const isUser = m.speaker === "user";
          const aiActive =
            aiSpeaking &&
            speakingAgent === m.speaker &&
            (m.speaker === "interviewer" || m.speaker === "trainer");
          const isLastOfSpeaker =
            messages.findLastIndex((x) => x.speaker === m.speaker) === i;
          const showWave = Boolean(aiActive && isLastOfSpeaker);
          return (
            <div
              key={i}
              className={`flex items-end gap-2.5 sm:gap-3 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser ? (
                <div className="flex flex-col items-center gap-1">
                  <SpeakerAvatar
                    role={m.speaker}
                    speaking={showWave}
                  />
                  <SpeakingIndicator active={showWave} tone="ai" />
                </div>
              ) : null}
              <div
                className={`max-w-[min(92%,36rem)] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6 sm:max-w-[min(78%,42rem)] sm:px-5 sm:py-3 sm:text-[15px] sm:leading-7 lg:max-w-[min(72%,48rem)] ${
                  m.speaker === "user"
                    ? "bg-indigo-600 text-white"
                    : m.speaker === "trainer"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-gray-100 text-gray-900"
                }`}
              >
                <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wide opacity-60">
                  <span>{m.speaker}</span>
                </div>
                {m.text ? renderRich(m.text) : "…"}
              </div>
              {isUser ? (
                <div className="flex flex-col items-center gap-1">
                  <SpeakerAvatar
                    role="user"
                    name={candidateName}
                    imageUrl={candidateImageUrl}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        {(hasPendingAnswer || interim) && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-end gap-2.5 sm:gap-3">
              <div className="max-w-[min(92%,36rem)] break-words rounded-2xl bg-indigo-600/40 px-3.5 py-2.5 text-sm text-white sm:max-w-[min(78%,42rem)] sm:px-5 sm:py-3 lg:max-w-[min(72%,48rem)]">
                {answerBufferRef.current
                  ? `${answerBufferRef.current}${interim ? " " + interim : ""}`
                  : interim}
              </div>
              <div className="flex flex-col items-center gap-1">
                <SpeakerAvatar
                  role="user"
                  name={candidateName}
                  imageUrl={candidateImageUrl}
                  speaking={listening && !muted && !aiSpeaking}
                />
                <SpeakingIndicator
                  active={listening && !muted && !aiSpeaking && Boolean(interim || hasPendingAnswer)}
                  tone="user"
                />
              </div>
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
        {mode === "practice" && lastScore != null && !activeWritten ? (
          <div className="flex flex-col items-start gap-2">
            <div
              className={`max-w-[min(92%,36rem)] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[min(78%,42rem)] sm:px-5 sm:py-3 lg:max-w-[min(72%,48rem)] ${
                lastScore >= PASS_THRESHOLD
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              Score: <span className="font-semibold">{lastScore}/100</span>
              {lastScore >= PASS_THRESHOLD
                ? " — nice, you cleared the bar."
                : ` — aim for ${PASS_THRESHOLD}+. Say the answer again to raise it.`}
            </div>
            {lastGradedTranscript ? (
              <div className="max-w-[min(92%,36rem)] rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 sm:max-w-[min(78%,42rem)] sm:px-5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  Graded transcript
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words leading-6">
                  {lastGradedTranscript}
                </p>
              </div>
            ) : null}
            {lastScore < PASS_THRESHOLD ? (
              <p className="max-w-[min(92%,36rem)] text-xs text-gray-400 sm:max-w-[min(78%,42rem)]">
                Graded from your answer as transcribed above. If it looks garbled,
                speech-to-text misheard you — edit the transcript or type below.
              </p>
            ) : null}
            {editingTranscript ? (
              <div className="flex w-full max-w-[min(92%,36rem)] flex-col gap-2 sm:max-w-[min(78%,42rem)]">
                <label
                  htmlFor="edit-transcript"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-600"
                >
                  Edit transcript
                </label>
                <textarea
                  id="edit-transcript"
                  value={transcriptDraft}
                  onChange={(e) => setTranscriptDraft(e.target.value)}
                  rows={4}
                  disabled={busy}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm leading-6 text-gray-900 shadow-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !transcriptDraft.trim()}
                    onClick={submitEditedTranscript}
                    className="min-h-10 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Re-score edited transcript
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditingTranscript(false)}
                    className="min-h-10 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {lastGradedTranscript && !busy ? (
                  <button
                    type="button"
                    onClick={openEditTranscript}
                    className="min-h-10 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900"
                  >
                    Edit transcript
                  </button>
                ) : null}
                {lastScore >= PASS_THRESHOLD && !busy ? (
                  <button
                    type="button"
                    onClick={continueToNextQuestion}
                    className="min-h-10 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Continue interview →
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* T-16: explicit voice-input status so the user always knows whether the
          mic is capturing them, waiting, processing — or paused for the AI. */}
      {supported ? (
        <div className="flex items-center gap-2 border-t border-gray-100 px-1 pt-2 text-xs sm:pt-3">
          {(() => {
            let dot = "bg-gray-300";
            let label = "Ready — start speaking, or type below";
            let pulse = false;
            if (micError) {
              dot = "bg-red-500";
              label = "Mic unavailable — type your answers below";
            } else if (muted) {
              dot = "bg-red-500";
              label = "Mic off — tap Unmute to speak";
            } else if (aiSpeaking) {
              dot = "bg-emerald-400";
              label = "AI is speaking — talk any time to jump in";
              pulse = true;
            } else if (busy) {
              dot = "bg-amber-500";
              label = "Thinking…";
              pulse = true;
            } else if (interim) {
              dot = "bg-emerald-500";
              label = "Listening…";
              pulse = true;
            } else if (hasPendingAnswer) {
              dot = "bg-emerald-500";
              label = "Got your answer — pause to submit, or press Done";
            } else if (listening) {
              // Mic is live and waiting for the candidate to start — blink so
              // it's obvious the app is recording them right now.
              dot = "bg-emerald-400";
              label = "Mic on — start speaking";
              pulse = true;
            }
            return (
              <>
                <span
                  className={`inline-block h-2 w-2 rounded-full ${dot} ${
                    pulse ? "animate-pulse" : ""
                  }`}
                  aria-hidden
                />
                <span className="text-gray-500">{label}</span>
              </>
            );
          })()}
        </div>
      ) : null}

      <TypeFallback
        onSend={handleUserUtterance}
        disabled={busy}
        mode={mode}
        suggestions={suggestions.filter((s) => !usedSuggestionIds.includes(s.id))}
        onSuggest={(id, q) => void askSuggested(id, q)}
        writtenQuestions={[]}
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
