import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <main className="min-h-dvh bg-[#f6f5f0] text-[#17201e]">
      <div className="safe-px mx-auto max-w-7xl px-4 py-8 sm:px-10 sm:py-10 lg:px-16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#65736d]">Your practice space</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.07em] sm:text-5xl">
              Hi, {session.user.name ?? "there"}.
            </h1>
          </div>
          <UserButton />
        </div>
        <div className="mt-8 max-w-2xl rounded-3xl bg-[#17201e] p-6 text-[#f6f5f0] sm:mt-10 sm:p-8">
          <p className="text-sm text-[#a9bbb2]">Ready when you are</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
            Start a tailored interview.
          </h2>
          <Link
            href="/interview/new"
            className="mt-8 inline-flex min-h-12 items-center rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e]"
          >
            Create interview ↗
          </Link>
        </div>
      </div>
    </main>
  );
}
