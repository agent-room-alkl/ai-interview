// T-06: POST /api/interview/[id]/chat
// Body: { userText?: string, agent: "interviewer" | "trainer", question?: string, answer?: string }
// Streams the requested agent's response and persists turns.
import { NextRequest } from "next/server";
import { streamText } from "ai";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { model } from "@/lib/ai";
import {
  buildInterviewerMessages,
  buildTrainerMessages,
  interviewerSystemPrompt,
  trainerSystemPrompt,
  type EngineContext,
  type Mode,
  type TranscriptTurn,
} from "@/lib/interview-engine";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.userId !== session.user.id) {
    return new Response("not_found", { status: 404 });
  }
  if (!interview.targetRole) {
    return new Response("no_target_role", { status: 400 });
  }

  const body = await req.json();
  const agent: "interviewer" | "trainer" = body.agent ?? "interviewer";

  // Preset question chip: persist + stream exact interviewer text (no LLM).
  const preset = typeof body.presetQuestion === "string" ? body.presetQuestion.trim() : "";
  if (preset && agent === "interviewer") {
    await prisma.turn.create({
      data: { interviewId: id, speaker: "interviewer", text: preset },
    });
    if (interview.status !== "in_progress" && interview.status !== "completed") {
      await prisma.interview.update({
        where: { id },
        data: { status: "in_progress" },
      });
    }
    return new Response(preset, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const ctx: EngineContext = {
    candidateName: interview.candidateName,
    targetRole: interview.targetRole,
    targetRoles:
      interview.targetRoles && interview.targetRoles.length
        ? interview.targetRoles
        : [interview.targetRole],
    resumeText: interview.resumeText ?? "",
    mode: interview.mode as Mode,
    language: interview.language,
  };

  // Persist an incoming user answer if present.
  if (body.userText?.trim()) {
    await prisma.turn.create({
      data: { interviewId: id, speaker: "user", text: body.userText.trim() },
    });
  }

  // Rebuild transcript after possibly inserting the user turn.
  const turns = await prisma.turn.findMany({
    where: { interviewId: id },
    orderBy: { createdAt: "asc" },
  });
  const transcript: TranscriptTurn[] = turns.map((t) => ({
    speaker: t.speaker as TranscriptTurn["speaker"],
    text: t.text,
  }));

  const system =
    agent === "trainer"
      ? trainerSystemPrompt(ctx)
      : interviewerSystemPrompt(ctx);
  const messages =
    agent === "trainer"
      ? buildTrainerMessages(
          ctx,
          body.question ?? "",
          body.answer ?? body.userText ?? "",
        )
      : buildInterviewerMessages(ctx, transcript);

  const result = streamText({
    model,
    system,
    messages,
    temperature: agent === "trainer" ? 0.4 : 0.7,
    onFinish: async ({ text }) => {
      await prisma.turn.create({
        data: { interviewId: id, speaker: agent, text },
      });
      if (interview.status !== "in_progress" && interview.status !== "completed") {
        await prisma.interview.update({
          where: { id },
          data: { status: "in_progress" },
        });
      }
    },
  });

  return result.toTextStreamResponse();
}
