"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PausedInterview({ interviewId, remainingSeconds }: { interviewId: string; remainingSeconds: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const resume = async () => {
    setBusy(true);
    const response = await fetch(`/api/interview/${interviewId}/resume`, { method: "POST" });
    if (response.ok) router.refresh();
    else setBusy(false);
  };
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6 py-12">
      <section className="w-full rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Interview paused</p>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900">Ready to continue?</h1>
        <p className="mt-3 text-sm text-gray-600">Your interview is saved. {minutes}:{seconds} remains when you resume.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => router.push("/dashboard")} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800">Back to dashboard</button>
          <button type="button" disabled={busy} onClick={resume} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? "Resuming…" : "Resume interview"}</button>
        </div>
      </section>
    </main>
  );
}
