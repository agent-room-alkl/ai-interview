// T-05: POST /api/interview/[id]/roles
// Reads stored resumeText for the interview, returns ranked role suggestions.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { suggestRoles } from "@/lib/resume-roles";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
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
  if (!interview.resumeText?.trim()) {
    return NextResponse.json({ error: "no_resume_text" }, { status: 400 });
  }

  try {
    const result = await suggestRoles(interview.resumeText);
    // Persist the detected interview language so the room/prompts/STT/TTS can
    // pick it up. The user can still override it on the role-selection screen.
    const lang = result.language?.trim().toLowerCase();
    if (lang) {
      await prisma.interview.update({ where: { id }, data: { language: lang } });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("suggestRoles failed", err);
    return NextResponse.json({ error: "analysis_failed" }, { status: 500 });
  }
}
