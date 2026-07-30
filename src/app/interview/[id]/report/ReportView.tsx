"use client";
// T-09: Scorecard UI + downloads (HTML file + print-to-PDF).
import { useCallback, useEffect, useState } from "react";

type Dimension = { name: string; score: number; feedback: string };
type Report = {
  overallScore: number;
  summary: string;
  dimensions: Dimension[];
  strengths: string[];
  improvements: string[];
};

function color(score: number) {
  if (score >= 75) return "hsl(145 70% 40%)";
  if (score >= 50) return "hsl(45 90% 45%)";
  return "hsl(5 75% 52%)";
}

export default function ReportView({
  interviewId,
  candidateName,
  targetRole,
  mode,
}: {
  interviewId: string;
  candidateName: string;
  targetRole: string;
  mode: string;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const loadReport = useCallback(async (force = false) => {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/interview/" + interviewId + "/report" + (force ? "?force=1" : ""),
        { method: "POST" },
      );
      if (!res.ok) throw new Error(await res.text());
      setReport((await res.json()) as Report);
    } catch {
      setError("Could not generate the report. Try again.");
    } finally {
      setRetrying(false);
    }
  }, [interviewId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  if (error)
    return (
      <div className="mx-auto max-w-2xl p-8 text-red-600">
        <p>{error}</p>
        <button
          type="button"
          disabled={retrying}
          onClick={() => void loadReport(true)}
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  if (!report)
    return (
      <div className="mx-auto max-w-2xl p-8 text-gray-500 animate-pulse">
        Scoring your interview…
      </div>
    );

  return (
    <div className="safe-px mx-auto max-w-3xl px-4 py-6 sm:p-6 print:p-0">
      <div className="flex flex-col gap-4 border-b-2 border-gray-900 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">Interview Report</h1>
          <p className="mt-1 break-words text-sm text-gray-500">
            {candidateName} · {targetRole} · {mode}
          </p>
        </div>
        <div className="sm:text-right">
          <div className="text-xs text-gray-500">Overall</div>
          <div
            className="text-4xl font-bold sm:text-5xl"
            style={{ color: color(report.overallScore) }}
          >
            {report.overallScore}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border p-4">
        <b>Summary</b>
        <p className="mt-1 text-gray-700">{report.summary}</p>
      </div>

      <div className="mt-4 rounded-xl border p-4">
        <b>Dimensions</b>
        {report.dimensions.map((d) => (
          <div key={d.name} className="mt-3">
            <div className="flex justify-between gap-3 font-medium">
              <span className="min-w-0 break-words">{d.name}</span>
              <span className="shrink-0">{d.score}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-gray-200">
              <div
                className="h-full"
                style={{ width: `${d.score}%`, background: color(d.score) }}
              />
            </div>
            <p className="mt-1 text-sm text-gray-600">{d.feedback}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border p-4">
          <b>Strengths</b>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
            {report.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-4">
          <b>Areas to improve</b>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
            {report.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row print:hidden">
        <a
          href={`/api/interview/${interviewId}/report/html`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white"
        >
          Download HTML
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium"
        >
          Download PDF
        </button>
      </div>
    </div>
  );
}
