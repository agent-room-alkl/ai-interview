"use client";

import { useState } from "react";
import type { PackId } from "@/lib/billing";

export function BuyPackButton({
  pack,
  label,
  className,
}: {
  pack: PackId;
  label: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout.");
        setPending(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error starting checkout.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          className ??
          "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17201e] px-5 py-3 text-sm font-semibold text-[#f6f5f0] disabled:opacity-60"
        }
      >
        {pending ? "Redirecting…" : label}
      </button>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
