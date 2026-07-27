import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <main className="min-h-dvh bg-[#f6f5f0] px-4 py-8 text-[#17201e] sm:px-6">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center font-semibold tracking-[-0.03em]"
      >
        ← ai interview
      </Link>
      <div className="mx-auto mt-12 flex max-w-md flex-col items-center sm:mt-20">
        <p className="self-start text-xs font-semibold uppercase tracking-[0.2em] text-[#e57b4f]">
          Start your practice
        </p>
        <h1 className="mt-4 self-start text-4xl font-semibold tracking-[-0.07em] sm:text-5xl">
          Create an account.
        </h1>
        <p className="mt-4 self-start text-[#65736d]">
          Build a private practice space for your next interview.
        </p>
        <div className="mt-8 w-full sm:mt-10">
          <SignUp
            routing="path"
            path="/signup"
            signInUrl="/login"
            forceRedirectUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "mx-auto w-full",
                card: "shadow-none border border-[#17201e]/10 bg-white/60",
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
