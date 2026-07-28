"use client";
// Role selection UI. Fetches AI role suggestions with staged loading + retry.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Role = {
  title: string;
  seniority: string;
  rationale: string;
  matchScore: number;
};

// Languages the interview can be conducted in. Value = BCP-47 primary subtag.
const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文 (Chinese)" },
  { code: "es", label: "Español (Spanish)" },
  { code: "fr", label: "Français (French)" },
  { code: "de", label: "Deutsch (German)" },
  { code: "ja", label: "日本語 (Japanese)" },
  { code: "ko", label: "한국어 (Korean)" },
  { code: "pt", label: "Português (Portuguese)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
];

const ANALYSIS_STAGES = [
  { id: "upload", label: "Reading uploaded résumé" },
  { id: "parse", label: "Parsing résumé text" },
  { id: "extract", label: "Extracting experience" },
  { id: "match", label: "Matching target roles" },
  { id: "done", label: "Ready" },
] as const;

type StageId = (typeof ANALYSIS_STAGES)[number]["id"];

export default function RoleSelector({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // T-06: multi-select — the candidate can interview for more than one role.
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  // T-05: interview language — detected from the résumé, user-overridable.
  const [language, setLanguage] = useState("en");
  const [languageDetected, setLanguageDetected] = useState(false);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearStageTimer = () => {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  };

  const loadRoles = useCallback(async () => {
    clearStageTimer();
    setLoading(true);
    setError(null);
    setRoles([]);
    setStageIndex(0);

    // Advance through intermediate stages while the request is in flight.
    stageTimerRef.current = setInterval(() => {
      setStageIndex((i) =>
        Math.min(i + 1, ANALYSIS_STAGES.length - 2), // stop before "done"
      );
    }, 900);

    try {
      const res = await fetch(`/api/interview/${interviewId}/roles`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      clearStageTimer();
      setStageIndex(ANALYSIS_STAGES.length - 1);
      setRoles(data.roles ?? []);
      if (typeof data.language === "string" && data.language.trim()) {
        const code = data.language.trim().toLowerCase().split("-")[0];
        if (LANGUAGE_OPTIONS.some((o) => o.code === code)) setLanguage(code);
        setLanguageDetected(true);
      }
      setLoading(false);
    } catch {
      clearStageTimer();
      setError(
        "Could not analyze résumé. Try again or enter a role manually.",
      );
      setLoading(false);
    }
  }, [interviewId]);

  useEffect(() => {
    void loadRoles();
    return () => clearStageTimer();
  }, [loadRoles, retryKey]);

  // Combine picked suggestions with an optional custom role; de-dupe.
  const chosenRoles = Array.from(
    new Set([...selected, ...(custom.trim() ? [custom.trim()] : [])]),
  );
  const currentStageId: StageId = ANALYSIS_STAGES[stageIndex]?.id ?? "upload";

  const toggleRole = (title: string) =>
    setSelected((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );

  async function start() {
    if (chosenRoles.length === 0) return;
    setSaving(true);
    const res = await fetch(`/api/interview/${interviewId}/target-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: chosenRoles, language }),
    });
    if (res.ok) router.push(`/interview/${interviewId}/room`);
    else {
      setSaving(false);
      setError("Could not save role.");
    }
  }

  return (
    <div className="safe-px mx-auto max-w-2xl px-4 py-6 sm:p-6">
      <h1 className="text-xl font-semibold leading-snug sm:text-2xl">
        Pick the role(s) you want to interview for
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        We analyzed your résumé and suggested the best-fit roles. Select one or
        more — the interview will cover all of them.
      </p>

      {(loading || error) && (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-800">
            {loading ? "Analyzing your résumé…" : "Analysis interrupted"}
          </p>
          <ol className="mt-4 space-y-3">
            {ANALYSIS_STAGES.map((stage, i) => {
              const done =
                (!loading && !error && i <= ANALYSIS_STAGES.length - 1) ||
                (loading && i < stageIndex) ||
                (!loading && !error && stage.id === "done");
              const active = loading && stage.id === currentStageId;
              const failed = Boolean(error) && i >= stageIndex;
              return (
                <li key={stage.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                      done && !failed && !active
                        ? "bg-emerald-100 text-emerald-700"
                        : active
                          ? "bg-indigo-100 text-indigo-700"
                          : failed && i === stageIndex
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-400"
                    }`}
                    aria-hidden
                  >
                    {done && !failed && !active
                      ? "✓"
                      : active
                        ? "…"
                        : failed && i === stageIndex
                          ? "!"
                          : i + 1}
                  </span>
                  <span
                    className={
                      active
                        ? "font-medium text-gray-900"
                        : done && !failed
                          ? "text-gray-600"
                          : "text-gray-400"
                    }
                  >
                    {stage.label}
                    {active ? (
                      <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
          {error ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              >
                Retry analysis
              </button>
            </div>
          ) : null}
        </div>
      )}

      {!loading && !error && roles.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {roles.map((r) => {
            const isSelected = selected.includes(r.title);
            return (
              <li key={r.title}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleRole(r.title)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? "border-indigo-500 ring-2 ring-indigo-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-bold ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-600 text-white"
                        : "border-gray-300 text-transparent"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="font-medium leading-snug">{r.title}</span>
                      <span className="shrink-0 text-xs text-gray-400">
                        {r.seniority} · {r.matchScore}% fit
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-gray-500">
                      {r.rationale}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && !error ? (
        <div className="mt-6">
          <label className="text-sm font-medium" htmlFor="interview-language">
            Interview language
          </label>
          <p className="mt-0.5 text-xs text-gray-500">
            {languageDetected
              ? "Detected from your résumé — change it if you’d prefer another language."
              : "Choose the language your interview will be conducted in."}
          </p>
          <select
            id="interview-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base sm:text-sm"
          >
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-6">
        <label className="text-sm font-medium">Add a custom role</label>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="e.g. Staff Machine Learning Engineer"
          className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base sm:text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          Added alongside any roles you selected above.
        </p>
      </div>

      {chosenRoles.length > 0 ? (
        <p className="mt-6 text-sm text-gray-600">
          Interviewing for:{" "}
          <span className="font-medium text-gray-900">
            {chosenRoles.join(", ")}
          </span>
        </p>
      ) : null}

      <button
        type="button"
        disabled={chosenRoles.length === 0 || saving || loading}
        onClick={start}
        className="mt-4 min-h-12 w-full rounded-xl bg-indigo-600 py-3 font-medium text-white disabled:opacity-40"
      >
        {saving
          ? "Starting…"
          : chosenRoles.length > 1
            ? `Start interview (${chosenRoles.length} roles)`
            : "Start interview"}
      </button>
    </div>
  );
}
