// T-09: GET  /api/interview/[id]/report        → JSON report (cached in a "report" Turn)
//        POST /api/interview/[id]/report?force=1 → (re)generate
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { scoreInterview, type InterviewReport } from "@/lib/report";

export const runtime = "nodejs";
export const maxDuration = 120;

async function loadOwned(id: string, userId: string) {
  const interview = await prisma.interview.findUnique({
    where: { id },
    include: { turns: { orderBy: { createdAt: "asc" } } },
  });
  if (!interview || interview.userId !== userId) return null;
  return interview;
}

async function getOrCreateReport(
  interview: NonNullable<Awaited<ReturnType<typeof loadOwned>>>,
  force: boolean,
): Promise<InterviewReport> {
  const cached = interview.turns.find((t) => t.speaker === "report");
  if (cached && !force) {
    return JSON.parse(cached.text) as InterviewReport;
  }
  const report = await scoreInterview(
    interview.turns.map((t) => ({ speaker: t.speaker, text: t.text })),
    {
      candidateName: interview.candidateName,
      targetRole: interview.targetRole ?? "the role",
      mode: interview.mode as "practice" | "interview",
    },
  );
  const text = JSON.stringify(report);
  if (cached) {
    await prisma.turn.update({ where: { id: cached.id }, data: { text } });
  } else {
    await prisma.turn.create({
      data: { interviewId: interview.id, speaker: "report", text },
    });
  }
  await prisma.interview.update({
    where: { id: interview.id },
    data: { status: "completed" },
  });
  return report;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const interview = await loadOwned(id, session.user.id);
  if (!interview)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const report = await getOrCreateReport(interview, false);
    return NextResponse.json(report);
  } catch (e) {
    console.error("report failed", e);
    return NextResponse.json({ error: "report_failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const interview = await loadOwned(id, session.user.id);
  if (!interview)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const report = await getOrCreateReport(interview, force);
    return NextResponse.json(report);
  } catch (e) {
    console.error("report failed", e);
    return NextResponse.json({ error: "report_failed" }, { status: 500 });
  }
}
