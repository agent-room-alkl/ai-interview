"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignUpState } from "./actions";

const initialState: SignUpState = {};

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUp, initialState);
  return (
    <main className="min-h-dvh bg-[#f6f5f0] px-4 py-8 text-[#17201e] sm:px-6">
      <Link href="/" className="inline-flex min-h-11 items-center font-semibold tracking-[-0.03em]">← ai interview</Link>
      <div className="mx-auto mt-12 max-w-md sm:mt-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e57b4f]">Start your practice</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.07em] sm:text-5xl">Create an account.</h1>
        <p className="mt-4 text-[#65736d]">Build a private practice space for your next interview.</p>
        <form action={action} className="mt-8 space-y-5 rounded-3xl border border-[#17201e]/10 bg-white/60 p-5 sm:mt-10 sm:p-8">
          <label className="block text-sm font-medium">Name<input name="name" required autoComplete="name" className="mt-2 min-h-11 w-full rounded-xl border border-[#17201e]/15 bg-white px-4 py-3 text-base outline-none focus:border-[#e57b4f] sm:text-sm" /></label>
          <label className="block text-sm font-medium">Email<input name="email" type="email" required autoComplete="email" className="mt-2 min-h-11 w-full rounded-xl border border-[#17201e]/15 bg-white px-4 py-3 text-base outline-none focus:border-[#e57b4f] sm:text-sm" /></label>
          <label className="block text-sm font-medium">Password<input name="password" type="password" minLength={8} required autoComplete="new-password" className="mt-2 min-h-11 w-full rounded-xl border border-[#17201e]/15 bg-white px-4 py-3 text-base outline-none focus:border-[#e57b4f] sm:text-sm" /><span className="mt-2 block text-xs text-[#65736d]">At least 8 characters.</span></label>
          {state.error && <p className="rounded-xl bg-[#fce7df] px-4 py-3 text-sm text-[#9c482d]">{state.error}</p>}
          <button disabled={pending} className="min-h-12 w-full rounded-full bg-[#17201e] px-5 py-3.5 text-sm font-semibold text-[#f6f5f0] disabled:opacity-50">{pending ? "Creating..." : "Create account"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-[#65736d]">Already have an account? <Link href="/login" className="font-semibold text-[#17201e] underline underline-offset-4">Log in</Link></p>
      </div>
    </main>
  );
}
