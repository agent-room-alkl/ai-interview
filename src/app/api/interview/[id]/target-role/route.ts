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
  const { role, roles, language } = await req.json();

  // Accept either a single `role` (legacy) or a `roles` array (multi-select).
  // De-dupe, trim, and drop empties; the first becomes the primary targetRole.
  const rawList: string[] = Array.isArray(roles)
    ? roles
    : typeof role === "string"
      ? [role]
      : [];
  const cleaned = Array.from(
    new Set(
      rawList
        .filter((r): r is string => typeof r === "string")
        .map((r) => r.trim())
        .filter(Boolean),
    ),
  );
  if (cleaned.length === 0) {
    return NextResponse.json({ error: "role_required" }, { status: 400 });
  }

  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Optional language override chosen by the user on the role-selection screen.
  const langOverride =
    typeof language === "string" && language.trim()
      ? language.trim().toLowerCase()
      : undefined;
  await prisma.interview.update({
    where: { id },
    data: {
      targetRole: cleaned[0],
      targetRoles: cleaned,
      status: "ready",
      ...(langOverride ? { language: langOverride } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
