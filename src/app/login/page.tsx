"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FormEvent, useState } from "react";

function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirect: false, callbackUrl: "/dashboard" });
    if (result?.error) { setError("Email or password is incorrect."); setPending(false); return; }
    window.location.href = result?.url ?? "/dashboard";
  }

  return (
    <main className="min-h-screen bg-[#f6f5f0] px-6 py-8 text-[#17201e]">
      <Link href="/" className="font-semibold tracking-[-0.03em]">← ai interview</Link>
      <div className="mx-auto mt-20 max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e57b4f]">Welcome back</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.07em]">Log in.</h1>
        <p className="mt-4 text-[#65736d]">Pick up where your interview practice left off.</p>
        <form onSubmit={submit} className="mt-10 space-y-5 rounded-3xl border border-[#17201e]/10 bg-white/60 p-6 sm:p-8">
          {params.get("created") && <p className="rounded-xl bg-[#e3eee7] px-4 py-3 text-sm text-[#356653]">Account created. You can log in now.</p>}
          <label className="block text-sm font-medium">Email<input name="email" type="email" defaultValue={params.get("email") ?? ""} required className="mt-2 w-full rounded-xl border border-[#17201e]/15 bg-white px-4 py-3 outline-none focus:border-[#e57b4f]" /></label>
          <label className="block text-sm font-medium">Password<input name="password" type="password" required className="mt-2 w-full rounded-xl border border-[#17201e]/15 bg-white px-4 py-3 outline-none focus:border-[#e57b4f]" /></label>
          {error && <p className="rounded-xl bg-[#fce7df] px-4 py-3 text-sm text-[#9c482d]">{error}</p>}
          <button disabled={pending} className="w-full rounded-full bg-[#17201e] px-5 py-3.5 text-sm font-semibold text-[#f6f5f0] disabled:opacity-50">{pending ? "Logging in..." : "Log in"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-[#65736d]">New here? <Link href="/signup" className="font-semibold text-[#17201e] underline underline-offset-4">Create an account</Link></p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#f6f5f0] text-[#17201e]">Loading...</main>}><LoginForm /></Suspense>;
}
