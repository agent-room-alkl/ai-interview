"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createInterview,
  type CreateInterviewState,
} from "@/app/interview/new/actions";

const initial: CreateInterviewState = {};

export function CreateInterviewForm({ initialResumeText = "" }: { initialResumeText?: string }) {
  const [state, formAction, pending] = useActionState(createInterview, initial);
  const [resumeText, setResumeText] = useState(initialResumeText);

  useEffect(() => {
    if (state.resumePreview) setResumeText(state.resumePreview);
  }, [state.resumePreview]);

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
            <input type="radio" name="mode" value="practice" defaultChecked className="size-4 shrink-0" />
            <span>
              <span className="font-semibold">Practice</span>
              <span className="mt-0.5 block text-xs text-[#65736d]">
                Interviewer + Trainer coach loop
              </span>
            </span>
          </label>
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 sm:flex-1">
            <input type="radio" name="mode" value="interview" className="size-4 shrink-0" />
            <span>
              <span className="font-semibold">Interview</span>
              <span className="mt-0.5 block text-xs text-[#65736d]">
                Realistic interviewer only
              </span>
            </span>
          </label>
        </div>
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

      <label className="block">
        <span className="text-sm font-medium text-[#65736d]">
          Or paste résumé text
        </span>
        <textarea
          name="resumeText"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          rows={10}
          placeholder="Upload a résumé above, or write/paste the background you want the AI to use…"
          className="mt-2 w-full rounded-2xl border border-[#17201e]/15 bg-white px-4 py-3 text-[#17201e] outline-none focus:border-[#17201e]"
        />
        <p className="mt-2 text-xs text-[#65736d]">
          Review and edit this background before continuing. Your name is kept; contact details are removed.
        </p>
        {initialResumeText ? (
          <p className="mt-2 rounded-xl bg-[#e3eee7] px-3 py-2 text-xs leading-5 text-[#52605a]">
            Your last saved résumé background is loaded here. Edit it or upload a new résumé to replace it.
          </p>
        ) : null}
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
