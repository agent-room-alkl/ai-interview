import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateInterviewForm } from "@/app/interview/new/CreateInterviewForm";
import { Logo } from "@/components/Logo";

export default async function NewInterviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { resumeContext: true },
  });

  return (
    <main className="min-h-dvh bg-[#f6f5f0] text-[#17201e]">
      <div className="safe-px mx-auto max-w-7xl px-4 py-8 sm:px-10 sm:py-10 lg:px-16">
        <header className="flex items-center justify-between border-b border-[#17201e]/10 pb-4">
          <Link href="/" className="inline-flex"><Logo compact /></Link>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-[#65736d] hover:opacity-70">
            ← Dashboard
          </Link>
        </header>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.07em] sm:text-5xl">
          Create interview
        </h1>
        <p className="mt-4 max-w-2xl text-[#65736d]">
          Add your name and résumé, pick Practice or Interview, then choose a
          target role.
        </p>
        <div className="w-full">
          <CreateInterviewForm initialResumeText={profile?.resumeContext ?? ""} />
        </div>
      </div>
    </main>
  );
}
