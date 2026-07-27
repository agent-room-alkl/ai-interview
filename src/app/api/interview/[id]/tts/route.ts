// T-06/T-07: POST /api/interview/[id]/tts  { text: string }
// Returns spoken audio (mp3) for the given text via OpenAI TTS.
// Called per-sentence by the room client so playback starts with low latency.
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
      response_format: "mp3",
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("TTS upstream error", upstream.status, detail);
    return new Response("tts_failed", { status: 502 });
  }

  // Stream the audio straight through to the client.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
