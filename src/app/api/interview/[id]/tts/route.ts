// T-06/T-07: POST /api/interview/[id]/tts  { text: string }
// T-35 (Plan A): stream raw PCM (24 kHz, 16-bit signed LE, mono) straight from
// OpenAI TTS to the client. The room player feeds these bytes into the Web
// Audio API and schedules them gaplessly, so speech starts as soon as the first
// bytes arrive instead of after a whole clip is generated — removing the
// stop-start choppiness of the earlier per-clip mp3 approach.
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY ?? "";
const TTS_MODEL = process.env.TTS_MODEL ?? "gpt-4o-mini-tts";
const TTS_VOICE = process.env.TTS_VOICE ?? "alloy";

export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });

  const { text } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return new Response("text_required", { status: 400 });
  }
  if (!OPENAI_KEY) return new Response("tts_not_configured", { status: 501 });

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text.slice(0, 4000),
      // Raw PCM so the client can schedule audio as it streams in. OpenAI
      // returns 24 kHz, 16-bit signed little-endian, mono.
      response_format: "pcm",
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("TTS upstream error", upstream.status, detail);
    return new Response("tts_failed", { status: 502 });
  }

  // Stream the raw PCM straight through to the client as it arrives.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/pcm",
      "X-Sample-Rate": "24000",
      "Cache-Control": "no-store",
    },
  });
}
