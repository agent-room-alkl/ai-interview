import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
    imageUrl: string | null;
  };
};

/**
 * App-level auth: Clerk session + ensure a matching Prisma User row
 * (User.id === Clerk userId for ownership checks).
 */
export async function auth(): Promise<AppSession | null> {
  const { userId } = await clerkAuth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    `${userId}@users.clerk`;
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    clerkUser?.username ||
    null;

  // Migrate legacy NextAuth rows that share this email onto the Clerk userId.
  // Must be done in a $transaction to avoid constraint races:
  //   1. Rename legacy row email first (frees UNIQUE slot) — keeps it alive so
  //      Interview_userId_fkey stays intact while we update interview rows.
  //   2. Upsert new Clerk user row.
  //   3. Re-point interview rows to new userId.
  //   4. Delete the now-empty legacy row.
  const legacyUser = await prisma.user.findUnique({ where: { email } });
  if (legacyUser && legacyUser.id !== userId) {
    await prisma.$transaction([
      // Free the email slot on the legacy row.
      prisma.user.update({
        where: { id: legacyUser.id },
        data: { email: `migrated-${legacyUser.id}@clerk.local` },
      }),
      // Create/update the Clerk user row with the real email.
      prisma.user.upsert({
        where: { id: userId },
        create: { id: userId, email, name, passwordHash: "" },
        update: { email, ...(name ? { name } : {}) },
      }),
      // Re-point legacy interviews to the Clerk user.
      prisma.interview.updateMany({
        where: { userId: legacyUser.id },
        data: { userId },
      }),
      // Remove the now-empty legacy row.
      prisma.user.delete({ where: { id: legacyUser.id } }),
    ]);
  } else {
    // No legacy row — just upsert the Clerk user.
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email, name, passwordHash: "" },
      update: { email, ...(name ? { name } : {}) },
    });
  }

  return {
    user: {
      id: userId,
      email,
      name,
      imageUrl: clerkUser?.imageUrl ?? null,
    },
  };
}
