// T-05: Résumé analysis → ranked role suggestions.
// Pure server-side helper: takes résumé text, returns 5–8 suggested roles.
import { generateObject } from "ai";
import { z } from "zod";
import { model } from "@/lib/ai";

export const RoleSuggestionSchema = z.object({
  roles: z
    .array(
      z.object({
        title: z
          .string()
          .describe("Job title / occupation, e.g. 'Senior Frontend Engineer'"),
        seniority: z
          .enum([
            "intern",
            "junior",
            "mid",
            "senior",
            "lead",
            "manager",
            "director",
          ])
          .describe("Best-fit seniority for this candidate"),
        rationale: z
          .string()
          .describe("One concise sentence on why this role fits the résumé"),
        matchScore: z
          .number()
          .min(0)
          .max(100)
          .describe("0–100 fit confidence based on the résumé"),
      }),
    )
    .min(5)
    .max(8),
});

export type RoleSuggestions = z.infer<typeof RoleSuggestionSchema>;

const SYSTEM = `You are a senior technical recruiter and career coach.
Given a candidate's résumé text, identify the 5–8 job roles they are best positioned to interview for.
Rank them by fit (highest matchScore first). Prefer concrete, market-standard titles.
Consider skills, years of experience, domains, and trajectory. Be realistic about seniority.
Return ONLY the structured object.`;

export async function suggestRoles(
  resumeText: string,
): Promise<RoleSuggestions> {
  const trimmed = resumeText.slice(0, 12_000); // guard against huge résumés
  const { object } = await generateObject({
    model,
    schema: RoleSuggestionSchema,
    system: SYSTEM,
    prompt: `Résumé:\n"""\n${trimmed}\n"""`,
  });
  object.roles.sort((a, b) => b.matchScore - a.matchScore);
  return object;
}
