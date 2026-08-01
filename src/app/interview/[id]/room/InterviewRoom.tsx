"use client";
// Voice: always-on mic → getUserMedia (echo cancellation) → energy-VAD
// segmenting → MediaRecorder → server STT (OpenAI), plus streaming TTS and mute.
// This replaced the browser Web Speech API, whose mobile behaviour was
// unreliable (no raw audio, no echo control, duplicated/echoed finals).
// Speaking over the AI stops its TTS (barge-in) and is captured as the answer.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import {
  SAMPLE_WRITTEN_QUESTIONS,
  type WrittenQuestion,
} from "@/lib/written-questions";
import {
  interviewQuestionLimit,
  scheduledWrittenQuestionId,
  PASS_THRESHOLD,
  coachingCues,
  type ExpressionLevel,
} from "@/lib/interview-engine";
import { shouldForceCompleteOnZero } from "@/lib/interview-complete";
import { QuestionCard } from "./QuestionCard";
import { SpeakingIndicator } from "./SpeakingIndicator";
import {
  connectRealtimeSTT,
  type RealtimeSTTController,
} from "./realtime-stt";

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


// T-13: the interviewer embeds [[ASK_WRITTEN:<id>]] to pose a written test.
const WRITTEN_MARKER = /\[\[ASK_WRITTEN:([a-z0-9_-]+)\]\]/gi;
const stripMarkers = (s: string) =>
  s.replace(WRITTEN_MARKER, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
// Parse "**Score:** NN/100" (or plain "Score: NN/100") out of a trainer message.
function parseScore(text: string): number | null {
  const normalized = text.replace(/／/g, "/").replace(/：/g, ":");
  const m =
    normalized.match(/\*\*Score:\*\*\s*(\d{1,3})\s*\/\s*100/i) ||
    normalized.match(/\bScore\s*:\s*(\d{1,3})\s*\/\s*100/i) ||
    normalized.match(/score\s*[:：]?\s*(\d{1,3})\s*\/\s*100/i) ||
    normalized.match(/score[^0-9]{0,16}(\d{1,3})\s*\/\s*100/i) ||
    normalized.match(/(?:分数|得分)\s*[:：]?\s*(\d{1,3})\s*\/\s*100/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

/** True when the latest pass has no real interviewer question after it. */
function shouldAdvanceAfterPass(turns: Msg[]): boolean {
  let lastPassIdx = -1;
  for (let i = 0; i < turns.length; i += 1) {
    if (turns[i].speaker !== "trainer") continue;
    const score = parseScore(turns[i].text);
    if (score != null && score >= PASS_THRESHOLD) lastPassIdx = i;
  }
  if (lastPassIdx < 0) return false;
  for (let i = lastPassIdx + 1; i < turns.length; i += 1) {
    const t = turns[i];
    if (t.speaker !== "interviewer") continue;
    const text = t.text.trim();
    if (text && !text.startsWith("[connection error")) return false;
  }
  return true;
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

function isRepeatRequest(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:…'"—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length > 80) return false;
  return (
    /\brepeat\b/.test(normalized) ||
    /say (that|it) again/.test(normalized) ||
    /what was the question/.test(normalized)
  );
}

export default function InterviewRoom({
  interviewId,
  mode,
  language,
  targetRole,
  durationMinutes,
  deadlineAt,
  initialTurns,
}: {
  interviewId: string;
  mode: "practice" | "interview";
  language: string | null;
  targetRole: string;
  durationMinutes: number;
  deadlineAt: string | null;
  initialTurns: Msg[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialTurns);
  const questionLimit = interviewQuestionLimit(durationMinutes);
  const questionsAsked = messages.filter((m) => m.speaker === "interviewer").length;
  const progress = Math.min(questionsAsked, questionLimit);
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  // Surfaced when the mic can't be acquired (permission blocked, no device, or
  // in use elsewhere) so mobile users aren't left staring at a dead mic.
  const [micError, setMicError] = useState<string | null>(null);
  // Voice-capture UI state: connecting = opening the realtime link; recording =
  // the candidate is speaking (server VAD); interim = live partial transcript.
  const [connecting, setConnecting] = useState(true);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [speakingAgent, setSpeakingAgent] = useState<
    "interviewer" | "trainer" | null
  >(null);
  // Shown when autoplay policy blocks interviewer TTS until a tap/click.
  const [speechUnlockNeeded, setSpeechUnlockNeeded] = useState(false);
  const speechUnlockNeededRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string>(
    initialTurns.filter((t) => t.speaker === "interviewer").at(-1)?.text ?? "",
  );
  const [activeWritten, setActiveWritten] = useState<WrittenQuestion | null>(
    null,
  );
  const [, setUsedWrittenIds] = useState<string[]>([]);
  const writtenCountRef = useRef(
    initialTurns.filter(
      (turn) => turn.speaker === "interviewer" && turn.text.startsWith("[Written "),
    ).length,
  );
  const writtenLimit = durationMinutes <= 10 ? 0 : durationMinutes <= 20 ? 1 : 2;
  // T-12: last trainer score (practice mode); gates progressing to the next Q.
  const [lastScore, setLastScore] = useState<number | null>(null);
  // Visible Pass handoff after a practice score of PASS_THRESHOLD+ (silent — no trainer TTS).
  const [showPassHandoff, setShowPassHandoff] = useState(false);
  const showPassHandoffRef = useRef(false);
  // After a pass, hide trainer/answer panels without wiping message history
  // (wiping history incorrectly reset progress back to 1/N).
  const [clearExchangeUI, setClearExchangeUI] = useState(false);
  // Legacy transcript editing helpers remain wired to the retry flow.
  const [lastGradedTranscript, setLastGradedTranscript] = useState("");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  // T-23: deadline is authoritative server state and cannot be reset by
  // refreshing, clearing browser storage, or opening another tab.
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  const expressionKey = `interview:${interviewId}:expression`;
  // T-14: how elaborate the AI's language is (selectable + switchable). A ref
  // mirrors it so the mount-only recognition path sends the current level too.
  // Initialize from the choice made on the role-selection screen (localStorage),
  // then it stays switchable here.
  const [expressionLevel, setExpressionLevel] = useState<ExpressionLevel>(() => {
    if (typeof window === "undefined") return "professional";
    const stored = window.localStorage.getItem(expressionKey);
    return stored === "clear" ||
      stored === "professional" ||
      stored === "advanced" ||
      stored === "expert"
      ? stored
      : "professional";
  });
  const expressionLevelRef = useRef<ExpressionLevel>(expressionLevel);

  const chatAbortRef = useRef<AbortController | null>(null);
  // Freeze the visible countdown immediately while the pause request is
  // leaving the room; the server remains authoritative after navigation.
  const pauseRequestedRef = useRef(false);
  // Mount effects may run twice under React Strict Mode; never request the
  // opening interviewer turn twice.
  const openingQuestionRequestedRef = useRef(false);
  const leavingRef = useRef(false);
  const mutedRef = useRef(muted);
  const aiSpeakingRef = useRef(aiSpeaking);
  const speakingAgentRef = useRef(speakingAgent);
  const busyRef = useRef(busy);
  // Resume / re-entry speech coordination (declared early for TTS drain).
  const resumeSpeechPendingRef = useRef<string | null>(null);
  const resumeSpeechDoneRef = useRef(false);
  const unlockInFlightRef = useRef(false);
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
  // Live realtime-STT connection (WebRTC → OpenAI). The mic is owned by it.
  const realtimeRef = useRef<RealtimeSTTController | null>(null);
  // Accumulate the candidate's completed utterances and only submit after a
  // brief idle (or the explicit "Done") — so coaching waits until they finish.
  const answerBufferRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasPendingAnswer, setHasPendingAnswer] = useState(false);
  // Latest submit fn for the idle timer (avoids stale closures).
  const submitAnswerRef = useRef<() => void>(() => {});
  const lastQuestionRef = useRef(lastQuestion);
  // Lets the realtime callbacks stop the AI's TTS for barge-in without capturing
  // a stale stopSpeaking closure.
  const stopSpeakingRef = useRef<() => void>(() => {});
  // No new speech for this long after a completed utterance auto-submits the
  // answer. Any speech resets it, so mid-answer thinking pauses never cut off.
  const SUBMIT_IDLE_MS = 7000;
  // T-01: two distinct silences. (1) A mid-answer pause (buffer non-empty) is
  // handled by SUBMIT_IDLE_MS above. (2) "Hasn't started answering yet" (buffer
  // empty, mic idle) never auto-advances — instead we gently remind the
  // candidate after IDLE_REMINDER_MS, and again once more, then offer explicit
  // Repeat / Hint / Skip controls. At most MAX_IDLE_REMINDERS spoken nudges.
  const IDLE_REMINDER_MS = 120000; // 2 minutes of true silence
  const MAX_IDLE_REMINDERS = 2;
  const idleReminderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleReminderCountRef = useRef(0);
  // After the second nudge, surface Repeat / Hint / Skip so a stuck candidate
  // has a way forward without us ever answering or advancing for them.
  const [showIdleOptions, setShowIdleOptions] = useState(false);
  // T-03: the meeting-room layout leads with speaker tiles + a live caption;
  // the full turn-by-turn transcript is tucked into a collapsible panel.
  // Ref indirection so the mount-only realtime STT callbacks reset reminders
  // without capturing a stale closure.
  const resetIdleRef = useRef<() => void>(() => {});

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    showPassHandoffRef.current = showPassHandoff;
  }, [showPassHandoff]);
  useEffect(() => {
    aiSpeakingRef.current = aiSpeaking;
  }, [aiSpeaking]);
  useEffect(() => {
    speakingAgentRef.current = speakingAgent;
  }, [speakingAgent]);
  useEffect(() => {
    speechUnlockNeededRef.current = speechUnlockNeeded;
  }, [speechUnlockNeeded]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    lastQuestionRef.current = lastQuestion;
    const q = lastQuestion.trim();
    // A new question needs one automatic audible play. A first user gesture
    // may unlock audio, but must never replay a question that already played.
    if (q) {
      setSpeechUnlockNeeded(true);
      resumeSpeechDoneRef.current = false;
    }
  }, [lastQuestion]);
  useEffect(() => {
    expressionLevelRef.current = expressionLevel;
    // Persist so a switch here (or the role-page choice) survives a reload.
    if (typeof window !== "undefined") {
      window.localStorage.setItem(expressionKey, expressionLevel);
    }
  }, [expressionLevel, expressionKey]);

  // ---------- TTS (streaming PCM → gapless Web Audio playback) ----------
  // Text is still batched into ~sentence chunks to keep request count low, but
  // each chunk's audio is streamed and scheduled onto one continuous timeline,
  // so playback starts at the first bytes and never stops between chunks.
  // Avoid cutting a normal first question at an arbitrary 80-character
  // boundary. That created a network gap between TTS requests and sounded
  // like the interviewer stuttered at the start of the room.
  const TTS_MIN_CHUNK = 320;
  const SAMPLE_RATE = 24000; // OpenAI pcm output rate
  const SCHED_LEAD = 0.35; // seconds of head-start when (re)starting from idle
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
    return ctx;
  }, []);

  // Browsers block autoplay until a user gesture. Always await resume before
  // scheduling PCM so we don't mark "speaking" while the context is suspended.
  const ensureAudioRunning = useCallback(async () => {
    const ctx = getAudioCtx();
    if (!ctx) return null;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return ctx;
      }
    }
    return ctx;
  }, [getAudioCtx]);

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
    setAiSpeaking(false);
    setSpeakingAgent(null);
  }, [clearTtsFlushTimer]);

  // Keep a live handle to stopSpeaking for the capture loop (barge-in).
  useEffect(() => {
    stopSpeakingRef.current = stopSpeaking;
  }, [stopSpeaking]);

  // Pull chunks off the queue and stream them back-to-back on the timeline.
  const startDrain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    const ctx = await ensureAudioRunning();
    if (!ctx || ctx.state !== "running") {
      // Autoplay blocked — keep queued text and ask the candidate to tap.
      drainingRef.current = false;
      setSpeechUnlockNeeded(true);
      setAiSpeaking(false);
      return;
    }
    let scheduledAny = false;
    let markedSpeaking = false;
    try {
      while (!cancelSpeakRef.current) {
        const next = ttsQueueRef.current.shift();
        if (!next) break;
        try {
          const before = nextStartRef.current;
          await streamChunk(ctx, next);
          if (nextStartRef.current > before) {
            scheduledAny = true;
            // Only claim "speaking" after real PCM was scheduled on a running context.
            if (!markedSpeaking && ctx.state === "running") {
              markedSpeaking = true;
              setAiSpeaking(true);
            }
          }
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") break;
          /* one chunk failed — keep going with the rest */
        }
      }
    } finally {
      drainingRef.current = false;
      if (scheduledAny && ctx.state === "running" && markedSpeaking) {
        if (speakingAgentRef.current === "interviewer") {
          resumeSpeechDoneRef.current = true;
          setSpeechUnlockNeeded(false);
        }
        // Keep aiSpeaking true until the scheduled audio has actually drained.
        const remainMs = Math.max(0, (nextStartRef.current - ctx.currentTime) * 1000) + 80;
        endTimerRef.current = setTimeout(() => {
          endTimerRef.current = null;
          if (!drainingRef.current && ttsQueueRef.current.length === 0) {
            setAiSpeaking(false);
            setSpeakingAgent(null);
          }
        }, remainMs);
      } else {
        // TTS failed, empty, or still suspended — offer a manual retry.
        if (!cancelSpeakRef.current) setSpeechUnlockNeeded(true);
        setAiSpeaking(false);
        if (!scheduledAny) setSpeakingAgent(null);
      }
    }
  }, [ensureAudioRunning, streamChunk]);

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

  // T-01: stop the pending "still waiting for you to start" nudge.
  const clearIdleReminder = useCallback(() => {
    if (idleReminderTimerRef.current) {
      clearTimeout(idleReminderTimerRef.current);
      idleReminderTimerRef.current = null;
    }
  }, []);

  // T-01: a fresh answering opportunity begins — the candidate spoke, submitted,
  // or a new question was posed. Reset the nudge cycle and hide the options.
  const resetIdleReminders = useCallback(() => {
    idleReminderCountRef.current = 0;
    setShowIdleOptions(false);
    clearIdleReminder();
  }, [clearIdleReminder]);

  useEffect(() => {
    resetIdleRef.current = resetIdleReminders;
  }, [resetIdleReminders]);

  const handleFinish = useCallback(() => {
    if (finishing || leavingRef.current) return;
    leavingRef.current = true;
    setFinishing(true);
    setTimeExpired(true);
    clearSilenceTimer();
    clearIdleReminder();
    stopSpeaking();
    chatAbortRef.current?.abort();
    setBusy(false);
    // Close the realtime mic link so nothing transcribes after we leave.
    realtimeRef.current?.close();
    realtimeRef.current = null;
    const reportUrl = `/interview/${interviewId}/report`;
    // Persist completed + best-effort report before leaving the room.
    void fetch(`/api/interview/${interviewId}/complete`, { method: "POST" })
      .catch(() => {})
      .finally(() => {
        router.push(reportUrl);
        window.setTimeout(() => {
          if (window.location.pathname.includes("/room")) {
            window.location.assign(reportUrl);
          }
        }, 1200);
      });
  }, [finishing, interviewId, router, stopSpeaking, clearSilenceTimer, clearIdleReminder]);

  const handlePause = useCallback(() => {
    if (finishing || leavingRef.current) return;
    pauseRequestedRef.current = true;
    setPausing(true);
    leavingRef.current = true;
    setFinishing(true);
    clearSilenceTimer();
    clearIdleReminder();
    stopSpeaking();
    chatAbortRef.current?.abort();
    setBusy(false);
    realtimeRef.current?.close();
    realtimeRef.current = null;
    void fetch(`/api/interview/${interviewId}/pause`, { method: "POST" })
      .then((response) => {
        if (response.ok) router.push("/dashboard");
        else throw new Error("pause failed");
      })
      .catch(() => {
        pauseRequestedRef.current = false;
        setPausing(false);
        leavingRef.current = false;
        setFinishing(false);
      });
  }, [finishing, interviewId, router, stopSpeaking, clearSilenceTimer, clearIdleReminder]);

  const handleTimeExpired = useCallback(() => {
    if (finishing || leavingRef.current) return;
    leavingRef.current = true;
    setFinishing(true);
    setTimeExpired(true);
    clearSilenceTimer();
    clearIdleReminder();
    stopSpeaking();
    chatAbortRef.current?.abort();
    setBusy(false);
    realtimeRef.current?.close();
    realtimeRef.current = null;
    void fetch(`/api/interview/${interviewId}/complete`, { method: "POST" }).catch(() => {});
  }, [finishing, interviewId, stopSpeaking, clearSilenceTimer, clearIdleReminder]);

  // Tick against the server-issued absolute deadline so tab throttling does not
  // make the countdown drift. At zero: stop I/O and force-complete.
  useEffect(() => {
    if (!deadlineAt) {
      setTimeLeft(null);
      return;
    }
    const deadline = Date.parse(deadlineAt);
    let finished = false;
    let timer: number | null = null;
    const update = () => {
      if (pauseRequestedRef.current) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (shouldForceCompleteOnZero(remaining, finished)) {
        finished = true;
        if (timer) window.clearInterval(timer);
        handleTimeExpired();
      }
    };
    update();
    if (!finished) timer = window.setInterval(update, 1000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [deadlineAt, handleTimeExpired]);

  // ---------- Chat (streaming text from an agent) ----------
  const runAgent = useCallback(
    async (
      agent: "interviewer" | "trainer",
      opts: {
        userText?: string;
        question?: string;
        answer?: string;
        replaceLastUserTurn?: boolean;
        coachingStyle?: "compact" | "model";
        /** Skip / forced advance — server must ask a new question even if score < pass. */
        forceNextQuestion?: boolean;
      } = {},
    ) => {
      if (leavingRef.current) return;
      chatAbortRef.current?.abort();
      const ac = new AbortController();
      chatAbortRef.current = ac;
      setBusy(true);
      // Buffer all practice-trainer responses until the stream finishes. This
      // keeps model answers (including their closing cue) in one TTS payload,
      // avoiding sentence-split/tail-flush races that can drop the last line.
      // Compact scored coaching still decides below whether that payload is
      // spoken or kept display-only after parsing the score.
      const deferTrainerSpeech = agent === "trainer" && mode === "practice";
      cancelSpeakRef.current = false;
      const nextSpeaking = deferTrainerSpeech ? null : agent;
      setSpeakingAgent(nextSpeaking);
      speakingAgentRef.current = nextSpeaking;
      const idx = messages.length + (opts.userText ? 1 : 0);
      // optimistic: append user turn locally
      if (opts.userText) {
        setMessages((m) => {
          if (opts.replaceLastUserTurn) {
            const copy = [...m];
            const index = copy.findLastIndex((message) => message.speaker === "user");
            if (index >= 0) copy[index] = { speaker: "user", text: opts.userText! };
            return copy;
          }
          return [...m, { speaker: "user", text: opts.userText! }];
        });
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
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { speaker: agent, text: stripMarkers(buffer) };
            return copy;
          });
          // speak newly-completed sentences for low latency (markers never spoken)
          if (!deferTrainerSpeech) {
            const match = buffer.slice(spokenUpTo).match(/[^.!?]+[.!?]+/g);
            if (match) {
              for (const sentence of match) {
                const clean = stripMarkers(sentence);
                if (clean) enqueueSpeech(clean);
              }
              spokenUpTo += match.join("").length;
            }
          }
        }
        // Ensure the final rendered bubble carries no control markers.
        const finalText = stripMarkers(buffer);
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { speaker: agent, text: finalText };
          return copy;
        });
        if (agent === "interviewer") {
          setLastQuestion(finalText);
          setClearExchangeUI(false);
          // T-13: interviewer decided to pose a written test question.
          const wm = buffer.match(WRITTEN_MARKER);
          const id = wm ? /ASK_WRITTEN:([a-z0-9_-]+)/i.exec(wm[0])?.[1] : null;
          // The model is instructed to emit the marker on scheduled rounds;
          // use the same deterministic fallback if it misses the marker so a
          // 20/30-minute session cannot silently skip its planned test.
          const questionNumber = messages.filter((m) => m.speaker === "interviewer").length + 1;
          const scheduledId = scheduledWrittenQuestionId(durationMinutes, questionNumber);
          const q = SAMPLE_WRITTEN_QUESTIONS.find(
            (x) => x.id === (id ?? scheduledId),
          ) ?? null;
          if (q && writtenCountRef.current < writtenLimit) {
            writtenCountRef.current += 1;
            setUsedWrittenIds((prev) =>
              prev.includes(q.id) ? prev : [...prev, q.id],
            );
            setLastQuestion(q.prompt);
            setActiveWritten(q);
          }
          // speak any trailing text (minus control markers)
          const tail = stripMarkers(buffer.slice(spokenUpTo));
          if (q) {
            // A marker-only or punctuation-free response can leave no TTS
            // sentence in the stream. Always give the candidate a spoken
            // handoff before the written QuestionCard in that case.
            if (tail) enqueueSpeech(tail);
            else if (spokenUpTo === 0) {
              enqueueSpeech("Please complete this written exercise.");
            }
          } else if (tail) {
            enqueueSpeech(tail);
          }
          finalizeSpeech();
        } else if (
          agent === "trainer" &&
          mode === "practice" &&
          opts.coachingStyle !== "model"
        ) {
          // T-12: score gates progressing to the next question.
          // P-02: a "See model answer" response (coachingStyle="model") has no
          // Score line — don't let parseScore()===null wipe the existing score
          // and hide the Try again / Skip / Continue controls.
          const score = parseScore(buffer);
          setLastScore(score);
          if (score != null && score >= PASS_THRESHOLD) {
            // Pass: display-only feedback, no trainer TTS, then Pass handoff UI.
            stopSpeaking();
            setShowPassHandoff(true);
          } else {
            // Below the pass bar (or unscored): still read the coaching aloud.
            if (finalText) {
              setSpeakingAgent("trainer");
              // Keep the localized try-again cue in its own TTS request. A
              // long markdown coaching payload can otherwise be truncated or
              // lose its final sentence even when the cue is visible in UI.
              const cue = coachingCues(language ?? undefined).model;
              const cueIndex = finalText.lastIndexOf(cue);
              const spokenBody = cueIndex >= 0
                ? finalText.slice(0, cueIndex).trim()
                : finalText;
              if (spokenBody) enqueueSpeech(spokenBody);
              enqueueSpeech(cue);
              finalizeSpeech();
            }
            setShowPassHandoff(false);
          }
        } else {
          const tail = stripMarkers(buffer.slice(spokenUpTo));
          if (tail) enqueueSpeech(tail);
          finalizeSpeech();
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
    [interviewId, language, messages.length, mode, enqueueSpeech, finalizeSpeech, stopSpeaking],
  );

  // T-12: clear the score gate whenever the candidate starts a fresh answer,
  // and let them advance to the next interviewer question once they've passed.
  // forceNext: Skip (below-pass or idle) must bypass the practice score gate.
  const continueToNextQuestion = useCallback((opts?: { forceNext?: boolean }) => {
    const forceNext = opts?.forceNext === true;
    // Pass auto-advance waits if busy; Skip aborts in-flight work and proceeds.
    if (busyRef.current && !forceNext) return;
    if (mode === "interview" && questionsAsked >= questionLimit) {
      void handleFinish();
      return;
    }
    resetIdleReminders();
    stopSpeaking();
    setShowPassHandoff(false);
    setLastScore(null);
    setLastGradedTranscript("");
    setEditingTranscript(false);
    setTranscriptDraft("");
    setActiveWritten(null);
    // Hide trainer/answer for the handoff, but keep message history so progress
    // and resume stay on the real question count (not reset to 1).
    setClearExchangeUI(true);
    // Drop stale Current question immediately so Skip never looks like a no-op.
    if (forceNext) setLastQuestion("");
    void runAgent("interviewer", { forceNextQuestion: forceNext });
  }, [
    handleFinish,
    mode,
    questionLimit,
    questionsAsked,
    runAgent,
    resetIdleReminders,
    stopSpeaking,
  ]);

  // Passing answers should flow into the next question automatically. Keep the
  // completed Trainer feedback + Pass badge visible for 3s (no trainer TTS),
  // then advance without making the candidate repeat a question they passed.
  useEffect(() => {
    if (
      mode !== "practice" ||
      busy ||
      activeWritten ||
      lastScore == null ||
      lastScore < PASS_THRESHOLD ||
      !showPassHandoff
    ) {
      return;
    }
    let cancelled = false;
    let retryTimer: number | undefined;
    const timer = window.setTimeout(() => {
      const tryAdvance = () => {
        if (cancelled) return;
        // Wait out any in-flight request rather than dropping the handoff.
        if (busyRef.current) {
          retryTimer = window.setTimeout(tryAdvance, 250);
          return;
        }
        continueToNextQuestion();
      };
      tryAdvance();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer != null) window.clearTimeout(retryTimer);
    };
  }, [activeWritten, busy, continueToNextQuestion, lastScore, mode, showPassHandoff]);

  // T-01: 2-minute-silence nudge. Fires only when the candidate has NOT begun
  // answering (guarded by the arming effect below and re-checked here via refs).
  // It never answers or advances for them — the first nudge is a gentle "take
  // your time", the second reveals Repeat / Hint / Skip controls. Capped at
  // MAX_IDLE_REMINDERS so a silent candidate is never nagged indefinitely.
  const fireIdleReminder = useCallback(() => {
    idleReminderTimerRef.current = null;
    if (mutedRef.current || aiSpeakingRef.current || busyRef.current) return;
    // Never nudge during the silent Pass → next-question handoff.
    if (showPassHandoffRef.current) return;
    if (idleReminderCountRef.current >= MAX_IDLE_REMINDERS) return;
    idleReminderCountRef.current += 1;
    const second = idleReminderCountRef.current >= 2;
    const who: Speaker = mode === "practice" ? "trainer" : "interviewer";
    const text = second
      ? "Still there? There's no rush. When you're ready, just start speaking — or use Repeat to hear the question again, Hint for a nudge, or Skip to move on."
      : "Take your time — whenever you're ready, go ahead and answer. I'm still listening.";
    if (second) setShowIdleOptions(true);
    setMessages((m) => [...m, { speaker: who, text }]);
    cancelSpeakRef.current = false;
    setSpeakingAgent(who);
    enqueueSpeech(text);
    finalizeSpeech();
  }, [mode, enqueueSpeech, finalizeSpeech]);

  // T-01: re-speak the current question (client-only, no new turn / no advance).
  const repeatQuestion = useCallback(() => {
    const q = lastQuestionRef.current.trim();
    if (!q || busyRef.current) return;
    resetIdleReminders();
    cancelSpeakRef.current = false;
    setSpeakingAgent("interviewer");
    enqueueSpeech(q);
    finalizeSpeech();
  }, [enqueueSpeech, finalizeSpeech, resetIdleReminders]);

  // Resume / re-entry: interviewer must actually SPEAK the active question.
  // Browsers often block autoplay until a gesture, so the first gesture only
  // unlocks a still-pending utterance; it never starts a duplicate replay.
  const speakInterviewerNow = useCallback(
    (text: string, opts?: { force?: boolean }) => {
      const q = stripMarkers(text).trim();
      // force: user tapped "hear interviewer" — allow even if a chat is idle-busy
      if (!q) return;
      if (!opts?.force && busyRef.current) return;
      resetIdleReminders();
      cancelSpeakRef.current = false;
      setSpeakingAgent("interviewer");
      speakingAgentRef.current = "interviewer";
      setSpeechUnlockNeeded(true);
      enqueueSpeech(q);
      finalizeSpeech();
    },
    [enqueueSpeech, finalizeSpeech, resetIdleReminders],
  );

  const unlockAndSpeakInterviewer = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    if (unlockInFlightRef.current) return;
    if (!force && (resumeSpeechDoneRef.current || aiSpeakingRef.current)) return;
    unlockInFlightRef.current = true;
    try {
      const ctx = await ensureAudioRunning();
      if (ctx && ctx.state === "suspended") {
        // Still blocked — keep the button visible.
        setSpeechUnlockNeeded(true);
      }
      const pending = resumeSpeechPendingRef.current;
      if (pending === "__await_next__") {
        // The interviewer request is already in flight (or has just landed).
        // A gesture should unlock/replay its current question, never start a
        // second chat request that would produce a duplicate opening prompt.
        const q = lastQuestionRef.current.trim();
        if (q && !busyRef.current && (force || !resumeSpeechDoneRef.current)) {
          resumeSpeechPendingRef.current = q;
          if (force) stopSpeaking();
          if (force) resumeSpeechDoneRef.current = false;
          speakInterviewerNow(q, { force: true });
        }
        return;
      }
      const q = stripMarkers(pending || lastQuestionRef.current).trim();
      if (!q) {
        if (!busyRef.current) {
          resumeSpeechPendingRef.current = "__await_next__";
          setClearExchangeUI(true);
          void runAgent("interviewer", {});
        }
        return;
      }
      // Re-queue from a clean slate after unlock.
      stopSpeaking();
      resumeSpeechDoneRef.current = false;
      speakInterviewerNow(q, { force: true });
    } finally {
      window.setTimeout(() => {
        unlockInFlightRef.current = false;
      }, 900);
    }
  }, [ensureAudioRunning, runAgent, speakInterviewerNow, stopSpeaking]);

  // T-01: ask the interviewer for a small hint — does not advance the question.
  const requestHint = useCallback(() => {
    if (busyRef.current) return;
    resetIdleReminders();
    const hint =
      "Start with one specific example. Briefly explain the situation, what you did, and the result.";
    setMessages((current) => [
      ...current,
      { speaker: "trainer", text: hint },
    ]);
    setSpeakingAgent("trainer");
    enqueueSpeech(hint);
    finalizeSpeech();
  }, [enqueueSpeech, finalizeSpeech, resetIdleReminders]);

  // T-01: candidate chooses to move on rather than answer this question.
  const skipQuestion = useCallback(() => {
    continueToNextQuestion({ forceNext: true });
  }, [continueToNextQuestion]);

  const handleUserUtterance = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busyRef.current || leavingRef.current) return;
      resetIdleReminders(); // T-01: they answered — end the silence-nudge cycle
      if (isRepeatRequest(t)) {
        // A spoken request to hear the question again is a control command, not
        // an answer. Replay locally so it never reaches the trainer/scorer.
        repeatQuestion();
        return;
      }
      setLastScore(null); // T-12: reset the gate for this new attempt
      setShowPassHandoff(false);
      setClearExchangeUI(false);
      setSpeechUnlockNeeded(false);
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
        setSpeakingAgent(who);
        enqueueSpeech(nudge);
        finalizeSpeech();
        return;
      }
      if (mode === "practice") {
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
    [mode, repeatQuestion, runAgent, enqueueSpeech, finalizeSpeech, resetIdleReminders],
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

  const prepareRetry = useCallback(() => {
    setLastScore(null);
    setShowPassHandoff(false);
    setClearExchangeUI(false);
    setEditingTranscript(false);
    setTranscriptDraft("");
    resetIdleReminders();
    const prompt = "Take your time. Try the same question again when you're ready.";
    setMessages((current) => [...current, { speaker: "trainer", text: prompt }]);
    setSpeakingAgent("trainer");
    enqueueSpeech(prompt);
    finalizeSpeech();
  }, [enqueueSpeech, finalizeSpeech, resetIdleReminders]);

  const showModelAnswer = useCallback(() => {
    if (!lastGradedTranscript || busyRef.current) return;
    void runAgent("trainer", {
      question: lastQuestionRef.current,
      answer: lastGradedTranscript,
      coachingStyle: "model",
    });
  }, [lastGradedTranscript, runAgent]);

  // Submit whatever the candidate has said so far (idle-triggered or via the
  // explicit "Done" button). Coaching only fires here, never mid-answer.
  const submitBufferedAnswer = useCallback(() => {
    clearSilenceTimer();
    const answer = answerBufferRef.current.trim();
    answerBufferRef.current = "";
    setHasPendingAnswer(false);
    if (!answer || busyRef.current || leavingRef.current) return;
    handleUserUtterance(answer);
  }, [clearSilenceTimer, handleUserUtterance]);

  // One completed utterance from realtime STT: append it to the pending answer
  // (utterances accumulate across pauses into one answer) and arm the auto-submit
  // timer. If the candidate stays silent for SUBMIT_IDLE_MS the answer submits;
  // any new speech (onSpeechStart) clears the timer, so a mid-answer thinking
  // pause never cuts them off. "Done answering" submits instantly.
  const onFinalUtterance = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setInterim("");
      answerBufferRef.current = answerBufferRef.current
        ? `${answerBufferRef.current} ${clean}`
        : clean;
      setHasPendingAnswer(true);
      clearSilenceTimer();
      if (!busyRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          if (busyRef.current) return;
          submitAnswerRef.current();
        }, SUBMIT_IDLE_MS);
      }
    },
    [clearSilenceTimer],
  );

  // Keep the submit ref pointed at the latest fn (used by Done / typed submit).
  useEffect(() => {
    submitAnswerRef.current = submitBufferedAnswer;
  }, [submitBufferedAnswer]);

  const openWrittenQuestion = useCallback((q: WrittenQuestion) => {
    if (busyRef.current || writtenCountRef.current >= writtenLimit) return;
    writtenCountRef.current += 1;
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
  }, [writtenLimit]);

  const submitWritten = useCallback(
    (utterance: string) => {
      setActiveWritten(null);
      handleUserUtterance(utterance);
    },
    [handleUserUtterance],
  );

  // ---------- Live realtime STT (WebRTC → OpenAI Realtime API) ----------
  // The browser mic (echo-cancelled, so the AI's TTS is removed) streams straight
  // to OpenAI over WebRTC; interim + final transcripts and server-VAD turn events
  // come back live. Word-by-word, device-independent, and speaking over the AI
  // both stops its TTS (barge-in) and is captured. Audio never touches our server.
  useEffect(() => {
    let controller: RealtimeSTTController | null = null;
    let cancelled = false;
    connectRealtimeSTT(interviewId, {
      onOpen: () => {
        if (cancelled) return;
        setConnecting(false);
        setListening(true);
        setMicError(null);
      },
      onSpeechStart: () => {
        if (cancelled || mutedRef.current) return;
        clearSilenceTimer();
        // T-01: they've started — cancel any pending silence nudge and reset the
        // cycle so a later pause starts fresh.
        resetIdleRef.current();
        setRecording(true);
      },
      onInterim: (text) => {
        if (cancelled || mutedRef.current) return;
        // Wait for actual recognized speech before interrupting TTS. Some
        // browsers emit speech_started for the AI audio leaking through the
        // mic before echo cancellation has settled, which used to cut off the
        // opening question after a fraction of a second.
        if (aiSpeakingRef.current && text.trim()) stopSpeakingRef.current();
        setInterim(text);
        setRecording(true);
      },
      onFinal: (text) => {
        if (cancelled || mutedRef.current) return;
        setRecording(false);
        onFinalUtterance(text);
      },
      onError: () => {
        /* transient realtime errors: keep the session; user can still type */
      },
    })
      .then((c) => {
        if (cancelled) {
          c.close();
          return;
        }
        controller = c;
        realtimeRef.current = c;
        c.setMuted(mutedRef.current);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setConnecting(false);
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setMicError(
            "Microphone access was blocked. Allow the mic for this site in your browser settings, then reload — or type your answers below.",
          );
        } else if (name === "NotFoundError" || name === "NotReadableError") {
          setMicError(
            "No microphone was found or it's in use by another app. Free it up, or type your answers below.",
          );
        } else {
          setMicError(
            "Couldn't start live voice — check your connection, or type your answers below.",
          );
        }
      });
    return () => {
      cancelled = true;
      controller?.close();
      realtimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  // T-01: each new question gets its own fresh reminder cycle.
  useEffect(() => {
    resetIdleReminders();
  }, [lastQuestion, resetIdleReminders]);

  // T-01: arm the "still waiting for you to start" nudge. It runs ONLY in the
  // true waiting state — mic live, nothing playing or in flight, no buffered
  // answer, and a question on the table. Any change (candidate speaks, AI talks,
  // a request starts, mute) tears the timer down via cleanup, so the 2-minute
  // clock counts only uninterrupted silence and can never fire mid-answer or
  // auto-advance. Capped at MAX_IDLE_REMINDERS.
  useEffect(() => {
    const waitingToStart =
      listening &&
      !connecting &&
      !muted &&
      !aiSpeaking &&
      !busy &&
      !recording &&
      !interim &&
      !hasPendingAnswer &&
      !finishing &&
      !timeExpired &&
      !activeWritten &&
      !showPassHandoff &&
      lastQuestion.trim().length > 0;
    if (!waitingToStart || idleReminderCountRef.current >= MAX_IDLE_REMINDERS) {
      clearIdleReminder();
      return;
    }
    clearIdleReminder();
    idleReminderTimerRef.current = setTimeout(fireIdleReminder, IDLE_REMINDER_MS);
    return () => clearIdleReminder();
  }, [
    listening,
    connecting,
    muted,
    aiSpeaking,
    busy,
    recording,
    interim,
    hasPendingAnswer,
    finishing,
    timeExpired,
    activeWritten,
    showPassHandoff,
    lastQuestion,
    fireIdleReminder,
    clearIdleReminder,
  ]);

  // Mute stops sending mic audio upstream and discards the pending answer.
  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      realtimeRef.current?.setMuted(next);
      if (next) {
        clearSilenceTimer();
        clearIdleReminder(); // T-01: no nudging while muted
        setRecording(false);
        setInterim("");
        answerBufferRef.current = "";
        setHasPendingAnswer(false);
      }
      return next;
    });
  };

  // Resume rules (dashboard re-entry / refresh):
  // - No interviewer yet → ask the first question (spoken via stream TTS).
  // - Practice pass with no next interviewer yet → advance + speak next Q.
  // - Otherwise stay on the current question and SPEAK it so the room feels live.
  // - Interview mode + latest user turn → interviewer should respond.
  useEffect(() => {
    const currentQuestion =
      initialTurns.filter((turn) => turn.speaker === "interviewer").at(-1)?.text ?? "";
    const hasInterviewer = currentQuestion.trim().length > 0;
    const advanceAfterPass =
      mode === "practice" && shouldAdvanceAfterPass(initialTurns);

    const roundMeta = (() => {
      let lastInterviewerIdx = -1;
      for (let i = initialTurns.length - 1; i >= 0; i -= 1) {
        if (initialTurns[i].speaker === "interviewer") {
          lastInterviewerIdx = i;
          break;
        }
      }
      if (lastInterviewerIdx < 0) {
        return {
          passed: false,
          latestTrainer: undefined as Msg | undefined,
          latestUser: undefined as Msg | undefined,
        };
      }
      let passed = false;
      let latestTrainer: Msg | undefined;
      let latestUser: Msg | undefined;
      for (let i = lastInterviewerIdx + 1; i < initialTurns.length; i += 1) {
        const turn = initialTurns[i];
        if (turn.speaker === "interviewer") break;
        if (turn.speaker === "trainer") {
          latestTrainer = turn;
          const score = parseScore(turn.text);
          if (score != null && score >= PASS_THRESHOLD) passed = true;
        }
        if (turn.speaker === "user") latestUser = turn;
      }
      return { passed, latestTrainer, latestUser };
    })();

    // Restore failing/unscored gate only — a pass advances below.
    if (roundMeta.latestTrainer && !roundMeta.passed && !advanceAfterPass) {
      setLastScore(parseScore(roundMeta.latestTrainer.text));
    }
    if (roundMeta.latestUser) setLastGradedTranscript(roundMeta.latestUser.text);

    if (!hasInterviewer) {
      if (openingQuestionRequestedRef.current) return;
      openingQuestionRequestedRef.current = true;
      resumeSpeechPendingRef.current = "__await_next__";
      setSpeechUnlockNeeded(true);
      void runAgent("interviewer", {});
      return;
    }
    if (mode === "interview" && initialTurns.at(-1)?.speaker === "user") {
      resumeSpeechPendingRef.current = "__await_next__";
      setSpeechUnlockNeeded(true);
      void runAgent("interviewer", {});
      return;
    }
    if (advanceAfterPass || (mode === "practice" && roundMeta.passed)) {
      // Passed round already persisted — advance without replaying pass TTS.
      setClearExchangeUI(true);
      setLastScore(null);
      setShowPassHandoff(false);
      resumeSpeechPendingRef.current = "__await_next__";
      setSpeechUnlockNeeded(true);
      void runAgent("interviewer", {});
      return;
    }

    // Open or failed round: interviewer starts from the current question and speaks it.
    resumeSpeechPendingRef.current = currentQuestion;
    setSpeechUnlockNeeded(true);
    const timer = window.setTimeout(() => {
      if (resumeSpeechDoneRef.current) return;
      speakInterviewerNow(currentQuestion, { force: true });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Soft unlock on first gesture (does not mark done until audio actually plays).
  useEffect(() => {
    const unlockAndMaybeSpeak = () => {
      if (!speechUnlockNeededRef.current) return;
      if (resumeSpeechDoneRef.current || aiSpeakingRef.current) return;
      void unlockAndSpeakInterviewer();
    };
    window.addEventListener("pointerdown", unlockAndMaybeSpeak);
    window.addEventListener("keydown", unlockAndMaybeSpeak);
    return () => {
      window.removeEventListener("pointerdown", unlockAndMaybeSpeak);
      window.removeEventListener("keydown", unlockAndMaybeSpeak);
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
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof RTCPeerConnection !== "undefined";

  return (
    <div className="safe-pt safe-px mx-auto flex h-dvh w-full max-w-6xl flex-col overflow-hidden px-3 sm:px-6 lg:max-w-7xl lg:px-10">
      <header className="flex shrink-0 flex-col gap-2 border-b border-gray-200 pb-2 pt-1 sm:flex-row sm:items-end sm:justify-between sm:pb-3">
        <div className="min-w-0">
          <Link href="/dashboard" className="mb-1 inline-flex"><Logo compact showTagline /></Link>
          <h1 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em] sm:text-2xl">
            {targetRole}
          </h1>
          <div className="mt-2 w-full max-w-sm" aria-label={`Question progress: ${progress} of ${questionLimit}`}>
            <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              <span>Question progress</span><span>{progress}/{questionLimit}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(progress / questionLimit) * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {timeLeft !== null && (
            <div
              aria-label={`Time remaining ${Math.floor(timeLeft / 60)} minutes ${timeLeft % 60} seconds`}
              className={`inline-flex h-9 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold tabular-nums ${
                timeLeft <= 60
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-gray-300 bg-white text-gray-800"
              }`}
            >
              <span className="text-[10px] uppercase tracking-wide opacity-70">Time</span>
              <span>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={toggleMute}
            className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold ${
              muted
                ? "border-red-600 bg-red-600 text-white"
                : "border-gray-300 bg-white text-gray-800"
            }`}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            disabled={finishing || pausing}
            onClick={handlePause}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-900 bg-gray-900 px-3 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pausing ? "Pausing…" : "Pause & leave"}
          </button>
          <button type="button" disabled={finishing} onClick={handleFinish} className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 disabled:opacity-60">End interview</button>
        </div>
      </header>

      {timeExpired && (
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          Time limit reached — finishing this interview safely.
        </div>
      )}

      {timeExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 px-4" role="presentation">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="time-expired-title">
            <h2 id="time-expired-title" className="text-lg font-semibold text-gray-900">Time is up</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Your interview time has ended. Would you like to return to your practice space or view the report?
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="min-h-10 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50" onClick={() => router.push("/dashboard")}>
                Back to dashboard
              </button>
              <button type="button" className="min-h-10 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800" onClick={() => router.push(`/interview/${interviewId}/report`)}>
                View report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* T-14/T-19: expression level — how elaborate the AI talks (not role
          difficulty). Kept OUTSIDE the scrolling transcript so it stays visible
          at the top; selectable at the start and switchable mid-interview
          (next turn applies). Styled as a distinct control bar so it reads as
          an operable control rather than faint caption text. */}
      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 sm:px-4">
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
      <p className="mt-1 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] leading-4 text-amber-900">
        Find a quiet place to practice. Headphones recommended so the mic doesn&apos;t
        pick up the AI or room noise.
      </p>

      {!supported && (
        <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          This browser can’t record audio for voice answers — type your answers
          below, or try a recent Chrome/Safari.
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

      {(() => {
        const userSpeaking = recording || interim || hasPendingAnswer;
        const liveUser = `${answerBufferRef.current}${
          interim ? (answerBufferRef.current ? " " : "") + interim : ""
        }`.trim();
        const currentQuestionIndex = messages.findLastIndex((m) => m.speaker === "interviewer");
        const currentTurn = currentQuestionIndex >= 0 ? messages.slice(currentQuestionIndex + 1) : messages;
        const latestTrainer = [...currentTurn].reverse().find((m) => m.speaker === "trainer")?.text;
        const latestUser = [...currentTurn].reverse().find((m) => m.speaker === "user")?.text;
        const trainerText =
          clearExchangeUI && !showPassHandoff
            ? mode === "practice"
              ? "Waiting for your answer…"
              : "Observing"
            : latestTrainer || (mode === "practice" ? "Waiting for your answer…" : "Observing");
        const answerText = userSpeaking
          ? liveUser || (recording ? "🎙 Listening…" : "…")
          : clearExchangeUI && !showPassHandoff
            ? "Your answer will appear here"
            : latestUser || "Your answer will appear here";
        const interviewerSpeaking = aiSpeaking && speakingAgent === "interviewer";
        const trainerSpeaking = aiSpeaking && speakingAgent === "trainer";
        return (
          <section className="mt-2 grid min-h-0 shrink-0 grid-cols-1 gap-2 lg:flex-1 lg:auto-rows-fr lg:grid-cols-3" aria-label="Current interview exchange">
            {/* Top: Current Question */}
            <div className={`flex max-h-[30vh] min-h-0 flex-col overflow-y-auto rounded-xl border px-3 py-2.5 sm:px-4 lg:max-h-none ${interviewerSpeaking ? "border-indigo-400 bg-indigo-100" : "border-indigo-200 bg-indigo-50"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                  Current question{interviewerSpeaking ? " · speaking" : ""}
                </p>
                <SpeakingIndicator active={interviewerSpeaking} tone="interviewer" />
              </div>
              <div className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-indigo-950 sm:text-sm sm:leading-5">
                {lastQuestion ||
                  (busy || clearExchangeUI
                    ? "Getting the next question…"
                    : "Waiting for the first question…")}
              </div>
            </div>
            {/* Middle: Trainer content */}
            <div className={`flex max-h-[30vh] min-h-0 flex-col overflow-y-auto rounded-xl border px-3 py-2.5 sm:px-4 lg:max-h-none ${trainerSpeaking ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Trainer{trainerSpeaking ? " · speaking" : ""}
                </p>
                <SpeakingIndicator active={trainerSpeaking} tone="trainer" />
              </div>
              <div aria-live="polite" className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-gray-900 sm:text-sm sm:leading-5">
                {renderRich(trainerText)}
                {mode === "practice" && lastScore != null ? <p className="mt-2 text-xs font-semibold text-amber-800">Score {lastScore}/100</p> : null}
                {showPassHandoff && lastScore != null && lastScore >= PASS_THRESHOLD ? (
                  <div
                    role="status"
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-900"
                  >
                    <span aria-hidden="true">✓</span>
                    Pass — next question in 3s
                  </div>
                ) : null}
              </div>
            </div>
            {/* Bottom: Your answer */}
            <div className={`flex max-h-[30vh] min-h-0 flex-col overflow-y-auto rounded-xl border px-3 py-2.5 sm:px-4 lg:max-h-none ${userSpeaking ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Your answer{userSpeaking ? " · speaking" : ""}
                </p>
                <SpeakingIndicator active={!!userSpeaking} tone="user" />
              </div>
              <div aria-live="polite" className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-gray-900 sm:text-sm sm:leading-5">
                {renderRich(answerText)}
              </div>
            </div>
          </section>
        );
      })()}

      {mode === "practice" && lastScore != null && !activeWritten && showPassHandoff && lastScore >= PASS_THRESHOLD && (
        <div
          role="status"
          className="mt-2 shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-center"
        >
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-900">Pass</p>
          <p className="mt-1 text-xs text-emerald-800">
            Score {lastScore}/100 — advancing to the next question…
          </p>
        </div>
      )}

      {mode === "practice" && lastScore != null && !activeWritten && !(showPassHandoff && lastScore >= PASS_THRESHOLD) && (
        <div className="mt-2 shrink-0 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          {editingTranscript ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-transcript" className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Edit transcript
              </label>
              <textarea
                id="edit-transcript"
                value={transcriptDraft}
                onChange={(e) => setTranscriptDraft(e.target.value)}
                rows={3}
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs leading-5 text-gray-900 shadow-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !transcriptDraft.trim()}
                  onClick={submitEditedTranscript}
                  className="min-h-9 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Re-score
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingTranscript(false)}
                  className="min-h-9 rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/50 pb-2">
                <div className="text-xs text-amber-900 font-medium">
                  Not passed yet · Your Score: <span className="text-sm font-bold text-amber-800">{lastScore}/100</span>
                </div>
                <div className="text-[10px] text-gray-500">
                  Below {PASS_THRESHOLD}/100 — improve this answer, or skip this question if you prefer.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {lastGradedTranscript && !busy && (
                  <button
                    type="button"
                    onClick={openEditTranscript}
                    className="min-h-9 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-semibold text-indigo-900 hover:opacity-85"
                  >
                    ✏️ Edit transcript
                  </button>
                )}
                {!busy && (
                  <button
                    type="button"
                    onClick={prepareRetry}
                    className="min-h-9 rounded-full border border-amber-300 bg-amber-100 px-4 py-1.5 text-xs font-semibold text-amber-900 hover:opacity-85"
                  >
                    🔄 Try again
                  </button>
                )}
                {lastGradedTranscript && !busy && (
                  <button
                    type="button"
                    onClick={showModelAnswer}
                    className="min-h-9 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-semibold text-violet-900 hover:opacity-85"
                  >
                    ✨ See model answer
                  </button>
                )}
                {!busy && (
                  <button
                    type="button"
                    onClick={() => continueToNextQuestion({ forceNext: true })}
                    className="min-h-9 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:opacity-85"
                  >
                    Skip this question →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeWritten ? (
        <div className="mt-2">
          <QuestionCard
            interviewId={interviewId}
            question={activeWritten}
            disabled={busy}
            onSubmit={submitWritten}
          />
        </div>
      ) : null}

      {/* T-03: bottom control bar — mic status, reminder options, and the core
          meeting controls (mute, Done, Leave) integrated in one place. */}
      <div className="shrink-0 border-t border-gray-100 pt-2 sm:pt-3">
      {/* T-16: explicit voice-input status so the user always knows whether the
          mic is capturing them, waiting, processing — or paused for the AI. */}
      {supported ? (
        <div className="flex items-center gap-2 px-1 text-xs">
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
            } else if (connecting) {
              dot = "bg-amber-500";
              label = "Connecting live voice…";
              pulse = true;
            } else if (aiSpeaking) {
              dot = "bg-emerald-400";
              label = "AI is speaking — talk any time to jump in";
              pulse = true;
            } else if (recording || interim) {
              dot = "bg-emerald-500";
            label = "Listening… take your time";
              pulse = true;
            } else if (busy) {
              dot = "bg-amber-500";
              label = "Thinking…";
              pulse = true;
            } else if (hasPendingAnswer) {
              dot = "bg-emerald-500";
              label = "Keep talking; your answer submits after a pause";
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

        {/* T-01: reminder options, surfaced after two silent nudges. */}
        {showIdleOptions && !busy && !hasPendingAnswer && !activeWritten ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">No rush —</span>
            <button
              type="button"
              onClick={repeatQuestion}
              className="min-h-9 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
            >
              🔁 Repeat question
            </button>
            <button
              type="button"
              onClick={requestHint}
              className="min-h-9 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900"
            >
              💡 Hint
            </button>
            <button
              type="button"
              onClick={skipQuestion}
              className="min-h-9 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
            >
              ⏭ Skip
            </button>
          </div>
        ) : null}

        {/* Keep any optional submit action separate from the exchange; primary
            meeting controls live in the header to preserve vertical space. */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {false && hasPendingAnswer && !busy ? (
            <button
              type="button"
              onClick={submitBufferedAnswer}
              className="min-h-10 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Done — submit ↵
            </button>
          ) : null}
        </div>
      </div>

      <TypeFallback
        onSend={handleUserUtterance}
        disabled={busy || finishing || timeExpired}
        mode={mode}
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
  writtenQuestions,
  onWritten,
}: {
  onSend: (t: string) => void;
  disabled: boolean;
  mode: string;
  writtenQuestions: WrittenQuestion[];
  onWritten: (q: WrittenQuestion) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="safe-pb mt-3 shrink-0 border-t border-gray-200 bg-[#f6f5f0] pt-3">
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
