// STT: POST /api/interview/[id]/transcribe  (multipart/form-data, field "audio")
// Mainstream voice architecture: the browser captures the candidate's mic with
// acoustic echo cancellation (so the AI's own TTS is removed from the input) and
// uploads each spoken segment here; we forward it to OpenAI transcription and
// return the text. This replaces the browser Web Speech API, whose behaviour was
// unreliable on mobile (no raw audio, no echo control, duplicated/echoed finals).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

// This endpoint calls api.openai.com directly; Gateway credentials are invalid
// for that origin.
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
// gpt-4o-transcribe is the current accurate streaming-grade model; whisper-1 is
// the classic fallback. Overridable via STT_MODEL.
const STT_MODEL = process.env.STT_MODEL ?? "gpt-4o-transcribe";

export async function POST(
  req: NextRequest,
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

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return new Response("audio_required", { status: 400 });
  }
  // Guard against oversized uploads (a normal answer segment is well under this).
  if (audio.size > 25 * 1024 * 1024) {
    return new Response("audio_too_large", { status: 413 });
  }

  const upstream = new FormData();
  // Preserve a sensible filename/extension so OpenAI can sniff the container.
  const type = audio.type || "audio/webm";
  const ext = type.includes("mp4")
    ? "mp4"
    : type.includes("ogg")
      ? "ogg"
      : type.includes("wav")
        ? "wav"
        : "webm";
  upstream.append("file", audio, `answer.${ext}`);
  upstream.append("model", STT_MODEL);
  upstream.append("response_format", "json");
  // Bias recognition toward the interview's language when we know it.
  const lang = interview.language?.split("-")[0]?.toLowerCase();
  if (lang) upstream.append("language", lang);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: upstream,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("STT upstream error", res.status, detail);
    return new Response("stt_failed", { status: 502 });
  }

  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ text: (data.text ?? "").trim() });
}
