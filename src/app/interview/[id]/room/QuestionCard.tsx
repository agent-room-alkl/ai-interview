"use client";

import { useState } from "react";
import {
  formatWrittenAnswer,
  type WrittenAnswer,
  type WrittenQuestion,
} from "@/lib/written-questions";

export function QuestionCard({
  interviewId,
  question,
  disabled,
  onSubmit,
}: {
  interviewId: string;
  question: WrittenQuestion;
  disabled?: boolean;
  onSubmit: (utterance: string, gradeDetail: string) => void;
}) {
  const [code, setCode] = useState(question.starterCode ?? "");
  const [single, setSingle] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit(answer: WrittenAnswer) {
    if (disabled || submitted || grading) return;
    setGrading(true);
    try {
      const res = await fetch(`/api/interview/${interviewId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answer }),
      });
      const grade = res.ok
        ? ((await res.json()) as { ok: boolean; detail: string })
        : { ok: true, detail: "Recorded." };
      const utterance = formatWrittenAnswer(question, answer);
      setSubmitted(true);
      setFeedback(grade.detail);
      onSubmit(utterance, grade.detail);
    } finally {
      setGrading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[min(95%,28rem)] max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-indigo-50 px-4 pb-2 pt-4">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
          {question.kind === "coding"
            ? `Coding · ${question.language ?? "code"}`
            : question.kind === "multi_choice"
              ? "Multi-choice"
              : question.options?.some((o) => o.imageUrl)
                ? "Graphic choice"
                : "Single choice"}
        </div>
        <p className="text-sm font-medium leading-snug text-gray-900">
          {question.prompt}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {question.kind === "coding" ? (
          <div className="space-y-2">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={disabled || submitted || grading}
              rows={8}
              spellCheck={false}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs leading-5 text-gray-900 outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              disabled={disabled || submitted || grading || !code.trim()}
              onClick={() => void submit({ kind: "coding", code })}
              className="min-h-10 w-full rounded-xl bg-indigo-600 text-sm font-medium text-white disabled:opacity-40"
            >
              {grading ? "Checking…" : "Submit code"}
            </button>
          </div>
        ) : null}

        {(question.kind === "single_choice" ||
          question.kind === "multi_choice") &&
        question.options ? (
          <ul className="space-y-2">
            {question.options.map((opt) => {
              const selected =
                question.kind === "single_choice"
                  ? single === opt.id
                  : multi.includes(opt.id);
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={disabled || submitted || grading}
                    onClick={() => {
                      if (question.kind === "single_choice") setSingle(opt.id);
                      else
                        setMulti((prev) =>
                          prev.includes(opt.id)
                            ? prev.filter((x) => x !== opt.id)
                            : [...prev, opt.id],
                        );
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                        : "border-gray-200 hover:border-gray-300"
                    } disabled:opacity-60`}
                  >
                    <span
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center border ${
                        question.kind === "multi_choice"
                          ? "rounded-sm"
                          : "rounded-full"
                      } ${
                        selected
                          ? "border-indigo-600 bg-indigo-600 text-[10px] text-white"
                          : "border-gray-300"
                      }`}
                      aria-hidden
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      {opt.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={opt.imageUrl}
                          alt={opt.label}
                          className="mb-1 h-16 w-full max-w-[10rem] rounded-lg object-contain"
                        />
                      ) : null}
                      <span className="font-medium text-gray-800">{opt.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                disabled={
                  disabled ||
                  submitted ||
                  grading ||
                  (question.kind === "single_choice"
                    ? !single
                    : multi.length === 0)
                }
                onClick={() => {
                  if (question.kind === "single_choice" && single) {
                    void submit({ kind: "single_choice", optionId: single });
                  } else if (question.kind === "multi_choice") {
                    void submit({ kind: "multi_choice", optionIds: multi });
                  }
                }}
                className="mt-1 min-h-10 w-full rounded-xl bg-indigo-600 text-sm font-medium text-white disabled:opacity-40"
              >
                {grading ? "Checking…" : "Submit answer"}
              </button>
            </li>
          </ul>
        ) : null}

        {!submitted ? (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Or answer by voice / text
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={disabled || grading}
                placeholder="Type or dictate into the mic, then submit…"
                className="min-h-10 flex-1 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                disabled={disabled || grading || !text.trim()}
                onClick={() => void submit({ kind: "text", text })}
                className="min-h-10 shrink-0 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        ) : null}

        {feedback ? (
          <p className="mt-3 text-xs text-gray-600" role="status">
            {feedback}
          </p>
        ) : null}
      </div>
    </div>
  );
}
