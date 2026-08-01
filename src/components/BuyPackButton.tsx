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

      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? ((await res.json()) as { url?: string; error?: string })
        : null;

      if (res.status === 401) {
        const returnTo =
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "/pricing";
        window.location.href = `/login?redirect_url=${encodeURIComponent(returnTo)}`;
        return;
      }

      if (!res.ok || !data?.url) {
        setError(
          data?.error ??
            (res.status === 503
              ? "Payments are not configured yet."
              : `Could not start checkout (${res.status}).`),
        );
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
