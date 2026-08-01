// T-09: GET  /api/interview/[id]/report        → JSON report (cached in a "report" Turn)
//        POST /api/interview/[id]/report?force=1 → (re)generate
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrCreateInterviewReport } from "@/lib/report-cache";

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
    const report = await getOrCreateInterviewReport(interview, false);
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
    const report = await getOrCreateInterviewReport(interview, force);
    return NextResponse.json(report);
  } catch (e) {
    console.error("report failed", e);
    return NextResponse.json({ error: "report_failed" }, { status: 500 });
  }
}
