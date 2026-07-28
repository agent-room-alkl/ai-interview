// Realtime STT: POST /api/interview/[id]/realtime-token
// Mints a short-lived ephemeral client secret so the browser can open a WebRTC
// connection straight to the OpenAI Realtime API for LIVE (word-by-word)
// transcription — no audio ever flows through our server, and the long-lived
// OPENAI_API_KEY never reaches the client. The session is transcription-only
// (no model responses): server-side VAD segments turns, Whisper/gpt-4o-transcribe
// streams interim + final transcripts back over the WebRTC data channel.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const STT_MODEL = process.env.STT_MODEL ?? "gpt-4o-transcribe";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  if (!OPENAI_KEY) return new Response("stt_not_configured", { status: 501 });

  const { id } = await ctx.params;
  const interview = await prisma.interview.findUnique({
    where: { id },
    select: { userId: true, language: true },
  });
  if (!interview || interview.userId !== session.user.id) {
    return new Response("not_found", { status: 404 });
  }
  const language = interview.language?.split("-")[0]?.toLowerCase();

  // GA Realtime session config (transcription-only). For WebRTC the audio codec
  // is negotiated in the SDP, so we don't pin an input format here — just the
  // transcription model, noise reduction, and server VAD (which closes each turn
  // so we get one final transcript per utterance).
  const sessionConfig = {
    type: "transcription",
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: STT_MODEL,
          ...(language ? { language } : {}),
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
      // Bind rate-limiting / abuse signals to this user server-side.
      "OpenAI-Safety-Identifier": session.user.id,
    },
    body: JSON.stringify({ session: sessionConfig }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("realtime token error", res.status, detail);
    return new Response("realtime_token_failed", { status: 502 });
  }

  const data = (await res.json()) as {
    value?: string;
    client_secret?: { value?: string };
    expires_at?: number;
  };
  // The ephemeral secret is at `.value` (GA) or `.client_secret.value` (legacy).
  const value = data.value ?? data.client_secret?.value ?? "";
  if (!value) {
    console.error("realtime token: no client secret in response");
    return new Response("realtime_token_failed", { status: 502 });
  }
  return NextResponse.json({ value, expiresAt: data.expires_at ?? null });
}
