import { createOpenAI } from "@ai-sdk/openai";

/**
 * Shared AI model via Vercel AI Gateway / OpenAI-compatible API.
 * Prefer AI_GATEWAY_API_KEY; fall back to OPENAI_API_KEY for local use.
 */
const apiKey =
  process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY ?? "";

const openai = createOpenAI({
  apiKey,
  baseURL: process.env.AI_GATEWAY_API_KEY
    ? "https://ai-gateway.vercel.sh/v1"
    : undefined,
});

/** Default chat model for interviewer / trainer / résumé analysis. */
export const model = openai(
  process.env.AI_MODEL ?? "openai/gpt-4o-mini",
);
