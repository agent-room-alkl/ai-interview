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

const SYSTEM = `You are a rigorous but fair interview evaluator.
Score the candidate's performance in this interview transcript across exactly these dimensions:
- "Communication" (clarity, concision, listening)
- "Technical/Role Fit" (depth and correctness for the target role)
- "Structure (STAR)" (organized, situation-task-action-result answers)
- "Confidence" (poise, ownership, minimal filler)
Give each a 0–100 score and specific feedback. Provide an overall score (weighted holistic, not a plain average), a short summary, concrete strengths, and concrete improvements.
Base every judgement ONLY on what the candidate actually said. Be honest — do not inflate.`;

export async function scoreInterview(
  transcript: { speaker: string; text: string }[],
  ctx: ReportContext,
): Promise<InterviewReport> {
  const convo = transcript
    .filter((t) => t.speaker === "interviewer" || t.speaker === "user")
    .map(
      (t) => `${t.speaker === "user" ? ctx.candidateName : "Interviewer"}: ${t.text}`,
    )
    .join("\n\n");

  const { object } = await generateObject({
    model,
    schema: ReportSchema,
    system: SYSTEM,
    prompt: `Target role: ${ctx.targetRole}\nSession type: ${ctx.mode}\n\nTRANSCRIPT:\n"""\n${convo.slice(0, 16000)}\n"""`,
  });
  return object;
}
