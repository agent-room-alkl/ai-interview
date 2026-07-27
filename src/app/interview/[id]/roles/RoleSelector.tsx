"use client";
// T-05: Role selection UI. Fetches AI role suggestions, lets user pick one
// or enter a custom role, then saves and advances to the interview room.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Role = {
  title: string;
  seniority: string;
  rationale: string;
  matchScore: number;
};

export default function RoleSelector({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/interview/${interviewId}/roles`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setRoles(data.roles ?? []);
      } catch {
        if (!cancelled)
          setError(
            "Could not analyze résumé. Try again or enter a role manually.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  const chosen = custom.trim() || selected;

  async function start() {
    if (!chosen) return;
    setSaving(true);
    const res = await fetch(`/api/interview/${interviewId}/target-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: chosen }),
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
        Pick the role you want to interview for
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        We analyzed your résumé and suggested the best-fit roles.
      </p>

      {loading && (
        <div className="mt-8 animate-pulse text-gray-500">
          Analyzing your résumé…
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {roles.map((r) => (
          <li key={r.title}>
            <button
              type="button"
              onClick={() => {
                setSelected(r.title);
                setCustom("");
              }}
              className={`w-full rounded-xl border p-4 text-left transition ${
                selected === r.title && !custom
                  ? "border-indigo-500 ring-2 ring-indigo-200"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="font-medium leading-snug">{r.title}</span>
                <span className="shrink-0 text-xs text-gray-400">
                  {r.seniority} · {r.matchScore}% fit
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">{r.rationale}</p>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <label className="text-sm font-medium">Or enter a custom role</label>
        <input
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setSelected(null);
          }}
          placeholder="e.g. Staff Machine Learning Engineer"
          className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base sm:text-sm"
        />
      </div>

      <button
        type="button"
        disabled={!chosen || saving}
        onClick={start}
        className="mt-8 min-h-12 w-full rounded-xl bg-indigo-600 py-3 font-medium text-white disabled:opacity-40"
      >
        {saving ? "Starting…" : "Start interview"}
      </button>
    </div>
  );
}
