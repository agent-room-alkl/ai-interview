import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
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

  // Migrate legacy NextAuth rows (cuid id) that share this email onto Clerk userId.
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail && existingByEmail.id !== userId) {
    await prisma.interview.updateMany({
      where: { userId: existingByEmail.id },
      data: { userId },
    });
    await prisma.user.delete({ where: { id: existingByEmail.id } });
  }

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      name,
      // Clerk owns credentials; legacy column kept for schema compat.
      passwordHash: "",
    },
    update: {
      email,
      ...(name ? { name } : {}),
    },
  });

  return { user: { id: userId, email, name } };
}
