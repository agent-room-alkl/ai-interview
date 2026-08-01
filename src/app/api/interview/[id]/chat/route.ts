// T-06: POST /api/interview/[id]/chat
// Body: { userText?: string, agent: "interviewer" | "trainer", question?: string, answer?: string }
// Streams the requested agent's response and persists turns.
import { NextRequest } from "next/server";
import { generateText, streamText } from "ai";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { model } from "@/lib/ai";
import {
  buildInterviewerMessages,
  buildTrainerMessages,
  interviewerSystemPrompt,
  interviewerTurnIsWritten,
  looksLikeInterviewerAnswer,
  pickScheduledWrittenId,
  scheduledWrittenQuestionNumber,
  trainerSystemPrompt,
  interviewQuestionLimit,
  type EngineContext,
  type EngineMessage,
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
  if (body.agent !== "interviewer" && body.agent !== "trainer") {
    return new Response("invalid_agent", { status: 400 });
  }
  const agent: "interviewer" | "trainer" = body.agent;

  // Formal interview mode is interviewer-only — no trainer/coach turns.
  if (agent === "trainer" && interview.mode === "interview") {
    return new Response("trainer_disabled_in_interview_mode", { status: 400 });
  }

  if (interview.status === "completed") {
    return new Response("interview_completed", { status: 409 });
  }
  if (
    interview.mode === "interview" &&
    interview.deadlineAt &&
    interview.deadlineAt.getTime() <= Date.now()
  ) {
    await prisma.interview.update({
      where: { id },
      data: { status: "completed" },
    });
    return new Response("interview_expired", { status: 410 });
  }

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

  // T-14: expression level chosen/switched by the candidate (per-request).
  const VALID_LEVELS = ["clear", "professional", "advanced", "expert"] as const;
  const expressionLevel = VALID_LEVELS.includes(body.expressionLevel)
    ? (body.expressionLevel as (typeof VALID_LEVELS)[number])
    : undefined;

  const ctx: EngineContext = {
    candidateName: interview.candidateName,
    targetRole: interview.targetRole,
    targetRoles:
      interview.targetRoles && interview.targetRoles.length
        ? interview.targetRoles
        : [interview.targetRole],
    resumeText: interview.resumeText ?? "",
    mode: interview.mode as Mode,
    durationMinutes: interview.durationMinutes,
    language: interview.language,
    expressionLevel,
    questionLimit: interviewQuestionLimit(interview.durationMinutes),
  };

  // Persist an incoming user answer if present.
  if (body.userText?.trim()) {
    const text = body.userText.trim();
    if (body.replaceLastUserTurn === true && agent === "trainer") {
      const latestUserTurn = await prisma.turn.findFirst({
        where: { interviewId: id, speaker: "user" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (!latestUserTurn) {
        return new Response("user_turn_not_found", { status: 409 });
      }
      await prisma.turn.update({
        where: { id: latestUserTurn.id },
        data: { text },
      });
    } else {
      await prisma.turn.create({
        data: { interviewId: id, speaker: "user", text },
      });
    }
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

  // The final formal-interview answer is already persisted above. Complete
  // without asking the model for one more interviewer question.
  if (
    body.completeAfterAnswer === true &&
    agent === "interviewer" &&
    interview.mode === "interview" &&
    transcript.filter((turn) => turn.speaker === "interviewer").length >= (ctx.questionLimit ?? 0)
  ) {
    await prisma.interview.updateMany({
      where: { id, status: { not: "completed" }, pausedAt: null },
      data: { status: "completed" },
    });
    return new Response(null, { status: 204 });
  }

  const system =
    agent === "trainer"
      ? trainerSystemPrompt(ctx, body.coachingStyle === "model")
      : interviewerSystemPrompt(ctx);
  const messages =
    agent === "trainer"
      ? buildTrainerMessages(
          ctx,
          body.question ?? "",
          body.answer ?? body.userText ?? "",
        )
      : buildInterviewerMessages(ctx, transcript, {
          // Skip / forced advance must not hit the practice "wait for pass" gate.
          forceNextQuestion: body.forceNextQuestion === true,
        });

  const persistAgentTurn = async (text: string) => {
    // Keep [[ASK_WRITTEN:id]] so resume can restore the card and scheduling
    // can detect that the required written slot was already used.
    const stored = text.trim();
    await prisma.turn.create({
      data: { interviewId: id, speaker: agent, text: stored || text },
    });
    if (interview.status !== "in_progress" && interview.status !== "completed") {
      await prisma.interview.update({
        where: { id },
        data: { status: "in_progress" },
      });
    }
  };

  // Interviewer: generate with reject/retry so first-person "answers" never land
  // in Current question. Trainer keeps streaming for lower latency coaching.
  if (agent === "interviewer") {
    let working: EngineMessage[] = messages;
    let text = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await generateText({
        model,
        system,
        messages: working,
        temperature: attempt === 0 ? 0.6 : 0.2,
      });
      text = result.text.trim();
      if (!looksLikeInterviewerAnswer(text)) break;
      working = [
        ...messages,
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            '[SYSTEM] REJECTED: that reply was a candidate-style answer/story, not an interviewer question. Ask ONE concise interview question ending with "?". No first-person experience narrative, STAR story, or model answer.',
        },
      ];
    }
    if (looksLikeInterviewerAnswer(text)) {
      text = `Thanks, ${ctx.candidateName}. Could you share a specific example from your recent work that best shows how you handle complex technical trade-offs for this role?`;
    }

    // Guarantee the scheduled written slot even if the model forgets the marker.
    const writtenSlot = scheduledWrittenQuestionNumber(ctx.durationMinutes ?? 20);
    const asked = transcript.filter((t) => t.speaker === "interviewer").length;
    const nextNum = asked + 1;
    const alreadyWritten = transcript.some(
      (t) => t.speaker === "interviewer" && interviewerTurnIsWritten(t.text),
    );
    if (
      writtenSlot != null &&
      !alreadyWritten &&
      nextNum === writtenSlot &&
      !interviewerTurnIsWritten(text)
    ) {
      const id = pickScheduledWrittenId(ctx);
      const lang = (ctx.language ?? "").toLowerCase();
      const fallbackLead =
        lang.startsWith("zh")
          ? `请完成第 ${writtenSlot} 题的书面练习，题目会显示在屏幕上，我也会读给你听。`
          : `Please complete this short written exercise for question ${writtenSlot}. I'll read the prompt aloud as well.`;
      const lead =
        text.replace(/\[\[ASK_WRITTEN:[a-z0-9_-]+\]\]/gi, "").trim() ||
        fallbackLead;
      text = `${lead}\n\n[[ASK_WRITTEN:${id}]]`;
    }

    await persistAgentTurn(text);
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const result = streamText({
    model,
    system,
    messages,
    temperature: 0.4,
    onFinish: async ({ text }) => {
      await persistAgentTurn(text);
    },
  });

  return result.toTextStreamResponse();
}
