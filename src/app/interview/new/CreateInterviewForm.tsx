"use client";
import { T, useLanguage } from "@/components/LanguageProvider";


import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createInterview,
  type CreateInterviewState,
} from "@/app/interview/new/actions";
import {
  hasActiveAccess,
  PAID_DURATIONS,
  TRIAL_HOURS,
} from "@/lib/billing";

const initial: CreateInterviewState = {};

export function CreateInterviewForm({
  initialResumeText = "",
  accessUntil = null,
  trialUsed = false,
  trialEndsAt = null,
  initialCandidateName = "",
}: {
  initialResumeText?: string;
  accessUntil?: string | null;
  trialUsed?: boolean;
  trialEndsAt?: string | null;
  initialCandidateName?: string;
}) {
  const { t } = useLanguage();
  const [state, formAction, pending] = useActionState(createInterview, initial);
  const [mode, setMode] = useState<"practice" | "interview">("practice");
  const [candidateName, setCandidateName] = useState(initialCandidateName);
  const [resumeText, setResumeText] = useState(initialResumeText);
  const paid = useMemo(() => hasActiveAccess(accessUntil), [accessUntil]);
  const trialActive = hasActiveAccess(trialEndsAt);
  const allowedDurations = paid || trialActive || !trialUsed
    ? [...PAID_DURATIONS]
    : [];
  const defaultDuration = allowedDurations[0] ?? 10;

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
            <T>{state.error}</T>
          </p>
        </div>
      ) : null}

      {/* Left Column: Form Controls (5 columns on large screen) */}
      <div className="space-y-6 md:col-span-5 flex flex-col justify-between">
        <div className="space-y-6">
          <label className="block">
            <span className="text-sm font-medium text-[#65736d]"><T>{"Candidate name"}</T></span>
            <input
              name="candidateName"
              required
              value={candidateName}
              onChange={(event) => setCandidateName(event.target.value)}
              placeholder={t("Your full name")}
              className="mt-2 min-h-11 w-full rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 text-base text-[#17201e] outline-none focus:border-[#17201e] sm:text-sm"
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-[#65736d]"><T>{"Mode"}</T></legend>
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
                  <span className="font-semibold"><T>{"Practice"}</T></span>
                  <span className="mt-0.5 block text-xs text-[#65736d]"><T>{"Interviewer + Trainer coach loop"}</T></span>
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
                  <span className="font-semibold"><T>{"Interview"}</T></span>
                  <span className="mt-0.5 block text-xs text-[#65736d]"><T>{"Realistic interviewer only"}</T></span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-[#65736d]"><T>{"Interview length"}</T></legend>
            {allowedDurations.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><T>{"Free trial used."}</T>{" "}
                <Link href="/pricing" className="font-semibold underline underline-offset-2"><T>{"Buy practice access"}</T></Link>{" "}<T>{"to start another session."}</T></div>
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
                      <span className="font-medium">{minutes}<T>{"min"}</T></span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-[#65736d]">
              {paid
                ? <T>{"Interview mode ends at the time limit; practice mode uses it as a soft guide."}</T>
                : trialUsed && !trialActive
                  ? <T>{"Your trial has expired. Buy a week for $3 or a month for $9."}</T>
                  : t(`Free trial: unlimited 10 / 20 / 30 minute sessions for ${TRIAL_HOURS} hours from your first practice.`)}{" "}
              {!paid ? (
                <Link href="/pricing" className="font-semibold underline underline-offset-2"><T>{"View pricing"}</T></Link>
              ) : null}
            </p>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-[#65736d]"><T>{"Résumé file (PDF, HTML, DOCX, or TXT)"}</T></span>
            <input
              name="resumeFile"
              type="file"
              accept=".pdf,.html,.htm,.docx,.txt,application/pdf,text/html,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="mt-2 block w-full text-sm text-[#65736d] file:mr-4 file:rounded-full file:border-0 file:bg-[#17201e] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#f6f5f0]"
            />
            <p className="mt-2 text-xs leading-5 text-[#65736d]"><T>{"We remove email, phone, and address details, then prepare a concise résumé background for the AI."}</T></p>
          </label>
        </div>

        <div className="pt-4 space-y-4">
          <button
            type="submit"
            disabled={pending || allowedDurations.length === 0}
            className="min-h-12 w-full rounded-full bg-[#17201e] px-6 py-3.5 text-sm font-semibold text-[#f6f5f0] disabled:opacity-60"
          >
            {pending
              ? <T>{"Uploading & parsing…"}</T>
              : allowedDurations.length === 0
                ? <T>{"Buy access to continue"}</T>
                : <T>{"Continue to role selection →"}</T>}
          </button>

          {pending ? (
            <div
              className="rounded-2xl border border-[#17201e]/10 bg-white/70 px-4 py-4 text-sm text-[#52605a]"
              aria-live="polite"
            >
              <p className="font-medium text-[#17201e]"><T>{"Preparing your session"}</T></p>
              <ol className="mt-3 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e57b4f]" /><T>{"Uploading résumé"}</T></li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e57b4f]" /><T>{"Parsing document text"}</T></li>
                <li className="flex items-center gap-2 text-[#65736d]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#17201e]/20" /><T>{"Next: extract experience & match roles"}</T></li>
              </ol>
            </div>
          ) : null}
        </div>
      </div>

      {/* Right Column: Résumé text editor (7 columns on large screen) */}
      <div className="md:col-span-7 flex flex-col h-full">
        <label className="block flex-1 flex flex-col min-h-[300px] md:min-h-[420px]">
          <span className="text-sm font-medium text-[#65736d]"><T>{"Or paste résumé text"}</T></span>
          <textarea
            name="resumeText"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Upload a résumé above, or write/paste the background you want the AI to use…"
            className="mt-2 flex-1 w-full rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 text-[#17201e] outline-none focus:border-[#17201e] text-xs font-mono leading-relaxed resize-none sm:text-sm"
          />
        </label>
        <p className="mt-2 text-xs text-[#65736d]"><T>{"Review and edit this background before continuing. Your name is kept; contact details are removed."}</T></p>
        {initialResumeText ? (
          <p className="mt-2 rounded-xl bg-[#e3eee7] px-3 py-2 text-xs leading-5 text-[#52605a]"><T>{"Your last saved résumé background is loaded here. Edit it or upload a new résumé to replace it."}</T></p>
        ) : null}
      </div>
    </form>
  );
}
