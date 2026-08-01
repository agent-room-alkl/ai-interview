// POST /api/interview/[id]/complete — mark session completed and ensure report.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateInterviewReport } from "@/lib/report-cache";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const interview = await prisma.interview.findUnique({
    where: { id },
    include: { turns: { orderBy: { createdAt: "asc" } } },
  });
  if (!interview || interview.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (interview.status !== "completed") {
    await prisma.interview.update({
      where: { id },
      data: { status: "completed" },
    });
  }

  // Best-effort report so Dashboard can show a score / View report.
  let reportReady = false;
  try {
    const fresh = await prisma.interview.findUnique({
      where: { id },
      include: { turns: { orderBy: { createdAt: "asc" } } },
    });
    if (fresh) {
      await getOrCreateInterviewReport(fresh, false);
      reportReady = true;
    }
  } catch (e) {
    console.error("complete: report generation failed", e);
  }

  return NextResponse.json({
    ok: true,
    status: "completed",
    reportReady,
    reportUrl: `/interview/${id}/report`,
  });
}
