// T-05: POST /api/interview/[id]/target-role  { role: string }
// Saves the user's chosen target role and marks the interview ready.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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
  const { role } = await req.json();
  if (typeof role !== "string" || !role.trim()) {
    return NextResponse.json({ error: "role_required" }, { status: 400 });
  }
  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await prisma.interview.update({
    where: { id },
    data: { targetRole: role.trim(), status: "ready" },
  });
  return NextResponse.json({ ok: true });
}
