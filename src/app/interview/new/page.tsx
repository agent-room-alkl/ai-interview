import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CreateInterviewForm } from "@/app/interview/new/CreateInterviewForm";

export default async function NewInterviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="min-h-dvh bg-[#f6f5f0] px-4 py-8 text-[#17201e] sm:px-10 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-[#65736d] hover:opacity-70">
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.07em] sm:text-5xl">
          Create interview
        </h1>
        <p className="mt-4 text-[#65736d]">
          Add your name and résumé, pick Practice or Interview, then choose a
          target role.
        </p>
        <CreateInterviewForm />
      </div>
    </main>
  );
}
