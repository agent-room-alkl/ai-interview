import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { withPracticeAccess } from "@/lib/practice-access";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { standardizeResumeText } from "@/lib/resume-parse";
import { buildPitchCoachingInput } from "@/lib/pitch-coaching";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  try {
    const form = await req.formData();
    const language = form.get("language") === "zh" ? "zh" : "en";
    const audio = form.get("audio");
    if (audio instanceof File) {
      if (!audio.size || audio.size > 5 * 1024 * 1024) return new Response("invalid_audio_size", { status: 400 });
      const key = process.env.OPENAI_API_KEY?.trim();
      if (!key) return new Response("stt_not_configured", { status: 503 });
      const access = await withPracticeAccess(session.user.id, 10, async () => true);
      if (!access.ok) return new Response("access_expired", { status: 403 });
      const upstream = new FormData();
      upstream.append("file", audio, audio.type.includes("mp4") ? "pitch.mp4" : "pitch.webm");
      upstream.append("model", process.env.STT_MODEL || "gpt-4o-transcribe");
      upstream.append("language", language);
      const result = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body: upstream,
        signal: AbortSignal.timeout(45000),
      });
      if (!result.ok) return new Response("transcription_failed", { status: 502 });
      const data = await result.json();
      return NextResponse.json({ text: typeof data.text === "string" ? data.text.trim() : "" });
    }
    const text = String(form.get("text") ?? "").trim();
    const seconds = Number(form.get("seconds"));
    const duration = Number(form.get("duration"));
    if (!text || text.length > 4000 || ![30, 60].includes(seconds) || !Number.isFinite(duration) || duration < 0 || duration > 65) {
      return new Response("invalid_pitch", { status: 400 });
    }
    const access = await withPracticeAccess(session.user.id, 10, async () => true);
    if (!access.ok) return new Response("access_expired", { status: 403 });
    const resumeField = form.get("resumeText");
    if (resumeField !== null && (typeof resumeField !== "string" || resumeField.length > 6000)) {
      return new Response("invalid_resume", { status: 400 });
    }
    // Only read the authenticated user's saved résumé; an explicit empty field opts out.
    const profile = resumeField === null
      ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { resumeContext: true } })
      : null;
    const coaching = buildPitchCoachingInput({
      transcript: text,
      resumeBackground: standardizeResumeText(resumeField ?? profile?.resumeContext ?? ""),
      language,
      targetSeconds: seconds as 30 | 60,
      recordedSeconds: duration,
    });
    const { object } = await generateObject({
      model,
      schema: z.object({
        score: z.number().min(0).max(100),
        feedback: z.string(),
        improvedPitch: z.string(),
        templateOutline: z.array(z.string()).min(3).max(5),
        personalizationNotes: z.string(),
      }),
      system: coaching.system,
      prompt: coaching.prompt,
    });
    return NextResponse.json({ ...object, resumeUsed: coaching.resumeUsed });
  } catch {
    return new Response("pitch_failed", { status: 502 });
  }
}
