"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createInterview,
  type CreateInterviewState,
} from "@/app/interview/new/actions";
import {
  hasActiveAccess,
  PAID_DURATIONS,
  TRIAL_DURATION_MINUTES,
} from "@/lib/billing";

const initial: CreateInterviewState = {};

export function CreateInterviewForm({
  initialResumeText = "",
  accessUntil = null,
  trialUsed = false,
}: {
  initialResumeText?: string;
  accessUntil?: string | null;
  trialUsed?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createInterview, initial);
  const [mode, setMode] = useState<"practice" | "interview">("practice");
  const [resumeText, setResumeText] = useState(initialResumeText);
  const paid = useMemo(() => hasActiveAccess(accessUntil), [accessUntil]);
  const allowedDurations = paid
    ? [...PAID_DURATIONS]
    : trialUsed
      ? []
      : [TRIAL_DURATION_MINUTES];
  const defaultDuration = allowedDurations[0] ?? TRIAL_DURATION_MINUTES;

  useEffect(() => {
    if (state.resumePreview) setResumeText(state.resumePreview);
  }, [state.resumePreview]);

  // React sets method/encType automatically for Server Action forms — do not set encType.
  return (
    <form action={formAction} className="mt-10 gap-8 md:grid md:grid-cols-12 space-y-6 md:space-y-0">
      {state.error ? (
        <div className="col-span-12">
          <p
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {state.error}
          </p>
        </div>
      ) : null}

      {/* Left Column: Form Controls (5 columns on large screen) */}
      <div className="space-y-6 md:col-span-5 flex flex-col justify-between">
        <div className="space-y-6">
          <label className="block">
            <span className="text-sm font-medium text-[#65736d]">Candidate name</span>
            <input
              name="candidateName"
              required
              placeholder="Your full name"
              className="mt-2 min-h-11 w-full rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 text-base text-[#17201e] outline-none focus:border-[#17201e] sm:text-sm"
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-[#65736d]">Mode</legend>
            <div className="flex flex-col gap-3">
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3">
                <input
                  type="radio"
                  name="mode"
                  value="practice"
                  checked={mode === "practice"}
                  onChange={() => setMode("practice")}
                  className="size-4 shrink-0"
                />
                <span>
                  <span className="font-semibold">Practice</span>
                  <span className="mt-0.5 block text-xs text-[#65736d]">
                    Interviewer + Trainer coach loop
                  </span>
                </span>
              </label>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3">
                <input
                  type="radio"
                  name="mode"
                  value="interview"
                  checked={mode === "interview"}
                  onChange={() => setMode("interview")}
                  className="size-4 shrink-0"
                />
                <span>
                  <span className="font-semibold">Interview</span>
                  <span className="mt-0.5 block text-xs text-[#65736d]">
                    Realistic interviewer only
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-[#65736d]">
              Interview length
            </legend>
            {allowedDurations.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Free trial used.{" "}
                <Link href="/pricing" className="font-semibold underline underline-offset-2">
                  Buy practice access
                </Link>{" "}
                to start another session.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {PAID_DURATIONS.map((minutes) => {
                  const enabled = allowedDurations.includes(minutes);
                  return (
                    <label
                      key={minutes}
                      className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-2 ${
                        enabled
                          ? "cursor-pointer border-[#17201e]/15 bg-white"
                          : "cursor-not-allowed border-[#17201e]/08 bg-[#f0efe8] opacity-60"
                      }`}
                    >
                      <input
                        type="radio"
                        name="durationMinutes"
                        value={minutes}
                        defaultChecked={enabled && minutes === defaultDuration}
                        disabled={!enabled}
                        className="size-4"
                      />
                      <span className="font-medium">{minutes} min</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-[#65736d]">
              {paid
                ? "Interview mode ends at the time limit; practice mode uses it as a soft guide."
                : trialUsed
                  ? "Purchase a pack on Pricing to unlock 10 / 20 / 30 minute sessions."
                  : `Free trial: one ${TRIAL_DURATION_MINUTES}-minute session. Buy access for 20/30 min and unlimited practice.`}{" "}
              {!paid ? (
                <Link href="/pricing" className="font-semibold underline underline-offset-2">
                  View pricing
                </Link>
              ) : null}
            </p>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-[#65736d]">
              Résumé file (PDF, HTML, DOCX, or TXT)
            </span>
            <input
              name="resumeFile"
              type="file"
              accept=".pdf,.html,.htm,.docx,.txt,application/pdf,text/html,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="mt-2 block w-full text-sm text-[#65736d] file:mr-4 file:rounded-full file:border-0 file:bg-[#17201e] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#f6f5f0]"
            />
            <p className="mt-2 text-xs leading-5 text-[#65736d]">
              We remove email, phone, and address details, then prepare a concise résumé background for the AI.
            </p>
          </label>
        </div>

        <div className="pt-4 space-y-4">
          <button
            type="submit"
            disabled={pending || allowedDurations.length === 0}
            className="min-h-12 w-full rounded-full bg-[#17201e] px-6 py-3.5 text-sm font-semibold text-[#f6f5f0] disabled:opacity-60"
          >
            {pending
              ? "Uploading & parsing…"
              : allowedDurations.length === 0
                ? "Buy access to continue"
                : "Continue to role selection →"}
          </button>

          {pending ? (
            <div
              className="rounded-2xl border border-[#17201e]/10 bg-white/70 px-4 py-4 text-sm text-[#52605a]"
              aria-live="polite"
            >
              <p className="font-medium text-[#17201e]">Preparing your session</p>
              <ol className="mt-3 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e57b4f]" />
                  Uploading résumé
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e57b4f]" />
                  Parsing document text
                </li>
                <li className="flex items-center gap-2 text-[#65736d]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#17201e]/20" />
                  Next: extract experience &amp; match roles
                </li>
              </ol>
            </div>
          ) : null}
        </div>
      </div>

      {/* Right Column: Résumé text editor (7 columns on large screen) */}
      <div className="md:col-span-7 flex flex-col h-full">
        <label className="block flex-1 flex flex-col min-h-[300px] md:min-h-[420px]">
          <span className="text-sm font-medium text-[#65736d]">
            Or paste résumé text
          </span>
          <textarea
            name="resumeText"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Upload a résumé above, or write/paste the background you want the AI to use…"
            className="mt-2 flex-1 w-full rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 text-[#17201e] outline-none focus:border-[#17201e] text-xs font-mono leading-relaxed resize-none sm:text-sm"
          />
        </label>
        <p className="mt-2 text-xs text-[#65736d]">
          Review and edit this background before continuing. Your name is kept; contact details are removed.
        </p>
        {initialResumeText ? (
          <p className="mt-2 rounded-xl bg-[#e3eee7] px-3 py-2 text-xs leading-5 text-[#52605a]">
            Your last saved résumé background is loaded here. Edit it or upload a new résumé to replace it.
          </p>
        ) : null}
      </div>
    </form>
  );
}
