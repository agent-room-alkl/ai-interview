import { createOpenAI } from "@ai-sdk/openai";

/**
 * Shared AI model. If AI_GATEWAY_API_KEY is set (non-empty) we route through the
 * Vercel AI Gateway; otherwise we call OpenAI directly with OPENAI_API_KEY.
 *
 * NOTE: we treat an EMPTY string the same as unset (trim → undefined) so that
 * blanking AI_GATEWAY_API_KEY in .env correctly falls back to OpenAI. Using `??`
 * against an empty string would NOT fall through, which is a common footgun.
 */
const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim() || undefined;
const openaiKey = process.env.OPENAI_API_KEY?.trim() || undefined;

const useGateway = Boolean(gatewayKey);
const apiKey = gatewayKey ?? openaiKey ?? "";

const openai = createOpenAI({
  apiKey,
  baseURL: useGateway ? "https://ai-gateway.vercel.sh/v1" : undefined,
});

/**
 * Default chat model for interviewer / trainer / résumé analysis / report.
 * Gateway model ids are namespaced ("openai/gpt-4o-mini"); direct OpenAI uses
 * the bare id ("gpt-4o-mini"). Honor AI_MODEL if set, else pick per mode.
 */
const configuredModel = process.env.AI_MODEL?.trim();
export const model = openai(
  configuredModel || (useGateway ? "openai/gpt-4o-mini" : "gpt-4o-mini"),
);
