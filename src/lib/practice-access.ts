import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canStartSession, hasActiveAccess, TRIAL_WINDOW_MS } from "@/lib/billing";

/** Serialize first-use trial claims with session creation so failures don't consume access. */
export async function withPracticeAccess<T>(userId: string, durationMinutes: number, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ai_interview"."User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false as const, reason: "Account not found." };
    const now = new Date();
    const gate = canStartSession({ ...user, durationMinutes, now });
    if (!gate.ok) return gate;
    if (gate.via === "trial" && !user.trialUsed) {
      await tx.user.update({ where: { id: userId }, data: { trialUsed: true, trialEndsAt: new Date(now.getTime() + TRIAL_WINDOW_MS) } });
    }
    return { ok: true as const, value: await work(tx) };
  });
}

/** Read-only guard: resuming old rooms never grants or resets a trial. */
export async function hasPracticeAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { accessUntil: true, trialEndsAt: true } });
  return Boolean(user && (hasActiveAccess(user.accessUntil) || hasActiveAccess(user.trialEndsAt)));
}
