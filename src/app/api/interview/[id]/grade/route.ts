// POST /api/interview/[id]/grade — server-side written-question grading.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { gradeWrittenAnswer } from "@/lib/written-questions-grade";
import type { WrittenAnswer } from "@/lib/written-questions";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json();
  const questionId =
    typeof body.questionId === "string" ? body.questionId.trim() : "";
  const answer = body.answer as WrittenAnswer | undefined;
  if (!questionId || !answer || typeof answer !== "object" || !answer.kind) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = gradeWrittenAnswer(questionId, answer);
  return NextResponse.json(result);
}
