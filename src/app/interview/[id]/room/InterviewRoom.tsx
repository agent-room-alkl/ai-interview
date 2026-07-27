"use client";
// T-07 (voice: always-on mic STT + streaming TTS + mute).
// T-26: suggested industry / role questions as tappable chips.
// T-31: turn-based capture (mic gated while AI speaks) to stop TTS self-echo /
//       noise being logged as the candidate's answer on speaker devices; plus
//       inline markdown rendering for chat bubbles.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { suggestedQuestionsForRole } from "@/lib/suggested-questions";

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

export default function InterviewRoom({
  interviewId,
  mode,
  candidateName,
  targetRole,
  initialTurns,
}: {
  interviewId: string;
  mode: "practice" | "interview";
  candidateName: string;
  targetRole: string;
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

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const leavingRef = useRef(false);
  const mutedRef = useRef(muted);
  const aiSpeakingRef = useRef(aiSpeaking);
  const busyRef = useRef(busy);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPlayingRef = useRef(false);
  const cancelSpeakRef = useRef(false);
  // Timestamp (ms) of when the AI last stopped speaking — used to keep the mic
  // gated for a short cooldown so trailing TTS echo isn't captured as an answer.
  const lastSpeakEndRef = useRef(0);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    aiSpeakingRef.current = aiSpeaking;
  }, [aiSpeaking]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // ---------- TTS (streaming, sentence-by-sentence) ----------
  const stopSpeaking = useCallback(() => {
    cancelSpeakRef.current = true;
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    lastSpeakEndRef.current = Date.now();
    setAiSpeaking(false);
  }, []);

  const playNext = useCallback(async () => {
    if (ttsPlayingRef.current) return;
    const next = ttsQueueRef.current.shift();
    if (!next) {
      lastSpeakEndRef.current = Date.now();
      setAiSpeaking(false);
      return;
    }
    ttsPlayingRef.current = true;
    setAiSpeaking(true);
    try {
      const res = await fetch(`/api/interview/${interviewId}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next }),
      });
      if (!res.ok) throw new Error("tts");
      const blob = await res.blob();
      if (cancelSpeakRef.current) {
        ttsPlayingRef.current = false;
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      await audio.play().catch(() => {});
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
      URL.revokeObjectURL(url);
    } catch {
      /* TTS unavailable — silent fallback to text only */
    } finally {
      ttsPlayingRef.current = false;
      if (!cancelSpeakRef.current) void playNext();
      else {
        lastSpeakEndRef.current = Date.now();
        setAiSpeaking(false);
      }
    }
  }, [interviewId]);

  const enqueueSpeech = useCallback(
    (sentence: string) => {
      const s = sentence.trim();
      if (!s) return;
      cancelSpeakRef.current = false;
      ttsQueueRef.current.push(s);
      void playNext();
    },
    [playNext],
  );

  const handleFinish = useCallback(() => {
    if (finishing || leavingRef.current) return;
    leavingRef.current = true;
    setFinishing(true);
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
  }, [finishing, interviewId, router, stopSpeaking]);

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
    [interviewId, messages.length, enqueueSpeech],
  );

  const handleUserUtterance = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busyRef.current) return;
      if (mode === "practice") {
        // Trainer coaches the latest answer to the last interviewer question.
        void runAgent("trainer", { question: lastQuestion, answer: t, userText: t });
      } else {
        void runAgent("interviewer", { userText: t });
      }
    },
    [mode, lastQuestion, runAgent],
  );

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
    [interviewId, enqueueSpeech],
  );

  // ---------- Speech recognition (always-on mic) ----------
  useEffect(() => {
    const Ctor =
      typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;
    if (!Ctor) return;
    const recog = new Ctor();
    recog.lang = "en-US";
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
        Date.now() - lastSpeakEndRef.current < 800
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
      const finalTrim = finalText.trim();
      setInterim(interimText);
      // Require a real multi-word phrase so single-token noise blips (a cough,
      // a stray syllable) don't submit as an answer.
      const wordCount = finalTrim ? finalTrim.split(/\s+/).length : 0;
      if (finalTrim.length >= 8 && wordCount >= 2) {
        setInterim("");
        handleUserUtterance(finalText);
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
        {interim && (
          <div className="flex justify-end">
            <div className="max-w-[min(85%,24rem)] break-words rounded-2xl bg-indigo-600/40 px-3.5 py-2.5 text-sm text-white sm:max-w-[80%] sm:px-4">
              {interim}
            </div>
          </div>
        )}
      </div>

      <TypeFallback
        onSend={handleUserUtterance}
        disabled={busy}
        mode={mode}
        suggestions={suggestions.filter((s) => !usedSuggestionIds.includes(s.id))}
        onSuggest={(id, q) => void askSuggested(id, q)}
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
}: {
  onSend: (t: string) => void;
  disabled: boolean;
  mode: string;
  suggestions: { id: string; label: string; question: string }[];
  onSuggest: (id: string, question: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="safe-pb border-t border-gray-200 bg-[#f6f5f0] pt-3">
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
