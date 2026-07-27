// T-09: Score an interview/practice transcript across dimensions.
import { generateObject } from "ai";
import { z } from "zod";
import { model } from "@/lib/ai";

const DimensionSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(100),
  feedback: z.string().describe("2-3 sentences of specific feedback"),
});

export const ReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string().describe("2-4 sentence overall assessment"),
  dimensions: z
    .array(DimensionSchema)
    .describe(
      "Scores for: Communication, Technical/Role Fit, Structure (STAR), Confidence",
    ),
  strengths: z.array(z.string()).min(1).max(5),
  improvements: z.array(z.string()).min(1).max(5),
});

export type InterviewReport = z.infer<typeof ReportSchema>;

export interface ReportContext {
  candidateName: string;
  targetRole: string;
  mode: "practice" | "interview";
}

const DIMENSION_NAMES = [
  "Communication",
  "Technical/Role Fit",
  "Structure (STAR)",
  "Confidence",
] as const;

/** Deterministic low score when the candidate barely spoke. */
function emptySessionReport(reason: string): InterviewReport {
  return {
    overallScore: 0,
    summary: reason,
    dimensions: DIMENSION_NAMES.map((name) => ({
      name,
      score: 0,
      feedback:
        "No usable candidate answers were recorded for this dimension, so it cannot be scored.",
    })),
    strengths: ["Session was started."],
    improvements: [
      "Answer the interviewer’s questions before finishing the session.",
      "Use headphones and Mute when not speaking so noise does not cut off the AI mid-question.",
      "Speak clearly after the interviewer finishes, then wait for the next prompt.",
    ],
  };
}

const SYSTEM = `You are a rigorous but fair interview evaluator.
Score the candidate's performance in this interview transcript across exactly these dimensions:
- "Communication" (clarity, concision, listening)
- "Technical/Role Fit" (depth and correctness for the target role)
- "Structure (STAR)" (organized, situation-task-action-result answers)
- "Confidence" (poise, ownership, minimal filler)
Give each a 0–100 score and specific feedback. Provide an overall score (weighted holistic, not a plain average), a short summary, concrete strengths, and concrete improvements.

CRITICAL RULES:
- Base every judgement ONLY on what the CANDIDATE actually said (lines labeled with the candidate name).
- Do NOT invent answers, experience, or filler the candidate never spoke.
- If the candidate said almost nothing, scores MUST be very low (0–20), not mid/high.
- Interviewer questions alone are NOT evidence of candidate skill.
Be honest — do not inflate.`;

export async function scoreInterview(
  transcript: { speaker: string; text: string }[],
  ctx: ReportContext,
): Promise<InterviewReport> {
  const userTurns = transcript.filter(
    (t) => t.speaker === "user" && t.text.trim().length > 0,
  );
  const userChars = userTurns.reduce((n, t) => n + t.text.trim().length, 0);

  // Guard against LLM hallucination on empty / noise-only sessions.
  if (userTurns.length === 0 || userChars < 40) {
    return emptySessionReport(
      userTurns.length === 0
        ? `${ctx.candidateName} finished without recording any answers, so this session cannot be scored.`
        : `${ctx.candidateName} only recorded very short utterances (${userChars} characters). There is not enough content for a fair score.`,
    );
  }

  const convo = transcript
    .filter((t) => t.speaker === "interviewer" || t.speaker === "user")
    .map(
      (t) =>
        `${t.speaker === "user" ? ctx.candidateName : "Interviewer"}: ${t.text}`,
    )
    .join("\n\n");

  const { object } = await generateObject({
    model,
    schema: ReportSchema,
    system: SYSTEM,
    prompt: `Target role: ${ctx.targetRole}
Session type: ${ctx.mode}
Candidate answer count: ${userTurns.length}
Candidate answer characters: ${userChars}

TRANSCRIPT:
"""
${convo.slice(0, 16000)}
"""

Remember: score ONLY the candidate's spoken content. If thin, keep scores low.`,
  });

  // Soft cap: thin sessions should not look like strong interviews.
  if (userTurns.length < 2 || userChars < 200) {
    const cap = userTurns.length < 2 ? 35 : 55;
    return {
      ...object,
      overallScore: Math.min(object.overallScore, cap),
      dimensions: object.dimensions.map((d) => ({
        ...d,
        score: Math.min(d.score, cap),
      })),
      summary: `${object.summary} (Note: only ${userTurns.length} short answer(s) were recorded — score capped.)`,
    };
  }

  return object;
}
