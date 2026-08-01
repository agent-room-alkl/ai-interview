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
  if (!interview.pausedAt) return NextResponse.json({ ok: true, resumed: true });
  const remainingSeconds = Math.max(0, interview.pausedRemainingSeconds ?? 0);
  const deadlineAt = new Date(Date.now() + remainingSeconds * 1000);
  await prisma.interview.update({
    where: { id },
    data: { pausedAt: null, pausedRemainingSeconds: null, deadlineAt, status: "in_progress" },
  });
  return NextResponse.json({ ok: true, resumed: true, deadlineAt: deadlineAt.toISOString() });
}
