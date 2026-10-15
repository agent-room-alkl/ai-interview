import { T, LanguageSwitcher } from "@/components/LanguageProvider";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Logo } from "@/components/Logo";
import { SignupAnalytics } from "@/components/SignupAnalytics";

export default function SignupPage() {
  return (
    <main className="min-h-dvh bg-[#f6f5f0] px-4 py-8 text-[#17201e] sm:px-6">
      <SignupAnalytics />
      <header className="flex items-center justify-between gap-3"><Link href="/" className="inline-flex min-h-11 items-center"><Logo compact /></Link><LanguageSwitcher /></header>
      <div className="mx-auto mt-12 flex max-w-md flex-col items-center sm:mt-20">
        <p className="self-start text-xs font-semibold uppercase tracking-[0.2em] text-[#e57b4f]"><T>{"Start your practice"}</T></p>
        <h1 className="mt-4 self-start text-4xl font-semibold tracking-[-0.07em] sm:text-5xl"><T>{"Create an account."}</T></h1>
        <p className="mt-4 self-start text-[#65736d]"><T>{"Build a private practice space for your next interview."}</T></p>
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
