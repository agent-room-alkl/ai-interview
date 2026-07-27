// T-06: Interview engine — system prompts + message construction for the
// Interviewer and Trainer agents. Framework-agnostic; consumed by the chat route.

export type Mode = "practice" | "interview";
export type Speaker = "interviewer" | "trainer" | "user" | "system";

/** Minimal chat message shape compatible with the AI SDK `messages` input.
 * NOTE: no "system" role here — the AI SDK / OpenAI responses API rejects a
 * system message inside `messages`. The system prompt is passed separately via
 * streamText({ system, messages }). */
export type EngineMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface EngineContext {
  candidateName: string;
  targetRole: string;
  resumeText: string;
  mode: Mode;
}

export interface TranscriptTurn {
  speaker: Speaker;
  text: string;
}

const sharedContext = (c: EngineContext) => `Candidate name: ${c.candidateName}
Target role: ${c.targetRole}
Résumé (verbatim, may be truncated):
"""
${c.resumeText.slice(0, 8000)}
"""`;

export function interviewerSystemPrompt(c: EngineContext): string {
  const modeNote =
    c.mode === "practice"
      ? "This is a PRACTICE session. Ask one question, then WAIT. A separate Trainer will coach the candidate between questions — do not coach yourself."
      : "This is a REAL interview simulation. Conduct it professionally end-to-end.";
  return `You are an experienced hiring interviewer for the role of "${c.targetRole}".
${modeNote}

Rules:
- Ask ONE question at a time. Keep questions concise and spoken-friendly (they will be read aloud via TTS).
- Tailor questions to the candidate's résumé and the target role; mix behavioral and role-specific technical questions.
- Ask natural follow-ups based on the candidate's previous answer before moving on.
- Do not answer for the candidate and do not lecture. Stay in character as the interviewer.
- After ~6–8 substantive exchanges, wrap up: thank the candidate and say the interview is complete.

${sharedContext(c)}`;
}

export function trainerSystemPrompt(c: EngineContext): string {
  return `You are an expert interview COACH ("Trainer") helping "${c.candidateName}" prepare for a "${c.targetRole}" interview.
You are given the interviewer's most recent QUESTION and the candidate's ANSWER.

Return, in this exact structure (markdown):
**What worked:** 1–2 bullets.
**To improve:** 1–3 specific, actionable bullets (structure, specificity, metrics, STAR, filler words).
**Optimized answer:** a rewritten, stronger version the candidate can say (first person, concise, natural to speak).

Then end with: "Now try saying it again in your own words." Keep it tight and encouraging.

${sharedContext(c)}`;
}

/** Build the user/assistant message array for the Interviewer's next turn.
 * Pass interviewerSystemPrompt(c) separately as streamText's `system`. */
export function buildInterviewerMessages(
  c: EngineContext,
  transcript: TranscriptTurn[],
): EngineMessage[] {
  const messages: EngineMessage[] = [];
  for (const t of transcript) {
    if (t.speaker === "interviewer")
      messages.push({ role: "assistant", content: t.text });
    else if (t.speaker === "user")
      messages.push({ role: "user", content: t.text });
    // trainer turns are intentionally omitted from the interviewer's context
  }
  if (transcript.length === 0) {
    messages.push({
      role: "user",
      content: "Please greet me briefly and ask your first interview question.",
    });
  }
  return messages;
}

/** Build the user message for the Trainer to critique the latest Q/A pair.
 * Pass trainerSystemPrompt(c) separately as streamText's `system`. */
export function buildTrainerMessages(
  c: EngineContext,
  question: string,
  answer: string,
): EngineMessage[] {
  return [
    {
      role: "user",
      content: `INTERVIEWER QUESTION:\n${question}\n\nCANDIDATE ANSWER:\n${answer}`,
    },
  ];
}
