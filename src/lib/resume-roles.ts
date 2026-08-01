// T-05: Résumé analysis → ranked role suggestions.
// Pure server-side helper: takes résumé text, returns 5–8 suggested roles.
import { generateObject } from "ai";
import { z } from "zod";
import { model } from "@/lib/ai";
import { MAX_RESUME_CONTEXT_CHARS } from "@/lib/resume-parse";

export const RoleSuggestionSchema = z.object({
  language: z
    .string()
    .describe(
      "BCP-47 primary language subtag the interview should be conducted in, " +
        "inferred from the language the résumé is predominantly written in " +
        "(e.g. 'en', 'zh', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'hi'). " +
        "Return just the subtag, lowercase.",
    ),
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
Also detect the language the résumé is predominantly written in and return it as "language"
(a lowercase BCP-47 primary subtag) — this is the language the interview will default to.
Return ONLY the structured object.`;

function detectPredominantLanguage(text: string, inferred: string): string {
  if (inferred === "zh") {
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    if (chineseChars.length < 50 || chineseChars.length / text.length < 0.1) {
      return "en";
    }
  }
  return inferred;
}

export async function suggestRoles(
  resumeText: string,
): Promise<RoleSuggestions> {
  const trimmed = resumeText.slice(0, MAX_RESUME_CONTEXT_CHARS);
  const { object } = await generateObject({
    model,
    schema: RoleSuggestionSchema,
    system: SYSTEM,
    prompt: `Résumé:\n"""\n${trimmed}\n"""`,
  });
  object.roles.sort((a, b) => b.matchScore - a.matchScore);
  object.language = detectPredominantLanguage(resumeText, object.language);
  return object;
}
