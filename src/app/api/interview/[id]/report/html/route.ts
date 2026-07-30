// T-09: GET /api/interview/[id]/report/html → downloadable standalone HTML report.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrCreateInterviewReport } from "@/lib/report-cache";
import { renderReportHtml } from "@/lib/report-html";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const interview = await prisma.interview.findUnique({
    where: { id },
    include: { turns: { orderBy: { createdAt: "asc" } } },
  });
  if (!interview || interview.userId !== session.user.id)
    return new Response("not_found", { status: 404 });

  const report = await getOrCreateInterviewReport(interview);

  const html = renderReportHtml(report, {
    candidateName: interview.candidateName,
    targetRole: interview.targetRole ?? "the role",
    mode: interview.mode,
    date: interview.createdAt.toISOString().slice(0, 10),
  });

  const safeName = interview.candidateName.replace(/[^a-z0-9]+/gi, "_");
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="interview-report-${safeName}.html"`,
    },
  });
}
