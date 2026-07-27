"use client";
// T-07 (voice: always-on mic STT + streaming TTS + mute) & T-08 (barge-in).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Speaker = "interviewer" | "trainer" | "user";
interface Msg {
  speaker: Speaker;
  text: string;
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
  const [lastQuestion, setLastQuestion] = useState<string>(
    initialTurns.filter((t) => t.speaker === "interviewer").at(-1)?.text ?? "",
  );

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const mutedRef = useRef(muted);
  const aiSpeakingRef = useRef(aiSpeaking);
  const busyRef = useRef(busy);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPlayingRef = useRef(false);
  const cancelSpeakRef = useRef(false);

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
    setAiSpeaking(false);
  }, []);

  const playNext = useCallback(async () => {
    if (ttsPlayingRef.current) return;
    const next = ttsQueueRef.current.shift();
    if (!next) {
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
      else setAiSpeaking(false);
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

  // ---------- Chat (streaming text from an agent) ----------
  const runAgent = useCallback(
    async (
      agent: "interviewer" | "trainer",
      opts: { userText?: string; question?: string; answer?: string },
    ) => {
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
      } catch {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            speaker: agent,
            text: "[connection error — check AI key / try again]",
          };
          return copy;
        });
      } finally {
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
      let finalText = "";
      let interimText = "";
      let bestConfidence = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const piece = r[0]?.transcript ?? "";
        const conf = typeof r[0]?.confidence === "number" ? r[0].confidence : 0;
        bestConfidence = Math.max(bestConfidence, conf);
        if (r.isFinal) finalText += piece;
        else interimText += piece;
      }
      // T-08 barge-in: ignore short/noisy fragments (room noise / TTS echo).
      // Require a real phrase before cutting the AI off.
      const interimTrim = interimText.trim();
      const finalTrim = finalText.trim();
      const substantial =
        interimTrim.length >= 12 ||
        (finalTrim.length >= 8 && bestConfidence >= 0.4);
      if (substantial && aiSpeakingRef.current) {
        stopSpeaking();
      }
      setInterim(interimText);
      // Ignore tiny finals (noise / single syllables) so they don't advance the loop.
      if (finalTrim.length >= 8) {
        setInterim("");
        handleUserUtterance(finalText);
      }
    };
    recog.onend = () => {
      setListening(false);
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
    <div className="mx-auto flex h-screen max-w-3xl flex-col p-4">
      <header className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="font-semibold">
            {mode === "practice" ? "Practice" : "Interview"} · {targetRole}
          </h1>
          <p className="text-xs text-gray-500">
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
        <div className="flex gap-2">
          <button
            onClick={toggleMute}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              muted ? "bg-red-600 text-white" : "border border-gray-300"
            }`}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={() => {
              stopSpeaking();
              recogRef.current?.abort();
              router.push(`/interview/${interviewId}/report`);
            }}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Finish
          </button>
        </div>
      </header>

      {!supported && (
        <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">
          This browser doesn’t support speech recognition — use Chrome, or type
          your answers below. (Headphones recommended so the mic doesn’t hear the
          AI.)
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.speaker === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
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
              {m.text || "…"}
            </div>
          </div>
        ))}
        {interim && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl bg-indigo-600/40 px-4 py-2 text-sm text-white">
              {interim}
            </div>
          </div>
        )}
      </div>

      <TypeFallback onSend={handleUserUtterance} disabled={busy} mode={mode} />
    </div>
  );
}

function TypeFallback({
  onSend,
  disabled,
  mode,
}: {
  onSend: (t: string) => void;
  disabled: boolean;
  mode: string;
}) {
  const [val, setVal] = useState("");
  return (
    <form
      className="flex gap-2 border-t pt-3"
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
            ? "Speak, or type your answer for the trainer to coach…"
            : "Speak, or type your answer…"
        }
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        disabled={disabled}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}
