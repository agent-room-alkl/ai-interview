import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <main className="min-h-screen bg-[#f6f5f0] px-6 py-10 text-[#17201e] sm:px-10"><div className="mx-auto max-w-4xl"><p className="text-sm text-[#65736d]">Your practice space</p><h1 className="mt-3 text-5xl font-semibold tracking-[-0.07em]">Hi, {session.user.name ?? "there"}.</h1><div className="mt-10 rounded-3xl bg-[#17201e] p-8 text-[#f6f5f0]"><p className="text-sm text-[#a9bbb2]">Ready when you are</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Start a tailored interview.</h2><Link href="/interview/new" className="mt-8 inline-block rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e]">Create interview ↗</Link></div></div></main>;
}
