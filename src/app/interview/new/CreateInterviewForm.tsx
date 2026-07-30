"use client";

import { useActionState, useState } from "react";
import {
  createInterview,
  type CreateInterviewState,
} from "@/app/interview/new/actions";

const initial: CreateInterviewState = {};

export function CreateInterviewForm() {
  const [state, formAction, pending] = useActionState(createInterview, initial);
  const [mode, setMode] = useState<"practice" | "interview">("practice");

  // React sets method/encType automatically for Server Action forms — do not set encType.
  return (
    <form action={formAction} className="mt-10 space-y-8">
      {state.error ? (
        <p
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

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
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 sm:flex-1">
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
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 sm:flex-1">
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
          <div className="grid grid-cols-3 gap-3">
            {[10, 20, 30].map((minutes) => (
              <label
                key={minutes}
                className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#17201e]/15 bg-white px-3 py-2"
              >
                <input
                  type="radio"
                  name="durationMinutes"
                  value={minutes}
                  defaultChecked={minutes === 20}
                  className="size-4"
                />
                <span className="font-medium">{minutes} min</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-[#65736d]">
            Interview mode ends at the time limit; practice mode uses it as a guide.
          </p>
      </fieldset>

      <label className="block">
        <span className="text-sm font-medium text-[#65736d]">
          Résumé file (PDF or DOCX)
        </span>
        <input
          name="resumeFile"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="mt-2 block w-full text-sm text-[#65736d] file:mr-4 file:rounded-full file:border-0 file:bg-[#17201e] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#f6f5f0]"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#65736d]">
          Or paste résumé text
        </span>
        <textarea
          name="resumeText"
          rows={10}
          placeholder="Paste your résumé here if you prefer not to upload a file…"
          className="mt-2 w-full rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 text-[#17201e] outline-none focus:border-[#17201e]"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-full bg-[#17201e] px-6 py-3.5 text-sm font-semibold text-[#f6f5f0] disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Uploading & parsing…" : "Continue to role selection →"}
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
    </form>
  );
}
