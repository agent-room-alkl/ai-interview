import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (interview.status === "completed") {
    return NextResponse.json({ error: "completed" }, { status: 409 });
  }
  if (interview.pausedAt) {
    return NextResponse.json({ ok: true, paused: true, remainingSeconds: interview.pausedRemainingSeconds ?? 0 });
  }
  const remainingSeconds = interview.deadlineAt
    ? Math.max(0, Math.ceil((interview.deadlineAt.getTime() - Date.now()) / 1000))
    : interview.durationMinutes * 60;
  await prisma.interview.update({
    where: { id },
    data: { pausedAt: new Date(), pausedRemainingSeconds: remainingSeconds, deadlineAt: null },
  });
  return NextResponse.json({ ok: true, paused: true, remainingSeconds });
}
