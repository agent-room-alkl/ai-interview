"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCESS_PACKS, canRequestRefund, formatUsd, type PackId } from "@/lib/billing";

export type PurchaseRow = {
  id: string;
  pack: string;
  days: number;
  amountCents: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

function packLabel(pack: string, days: number): string {
  if (pack in ACCESS_PACKS) return ACCESS_PACKS[pack as PackId].name;
  return `${days} day${days === 1 ? "" : "s"}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "refund_requested":
      return "Refund requested";
    case "refunded":
      return "Refunded";
    default:
      return status;
  }
}

export function PurchaseHistory({ purchases }: { purchases: PurchaseRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestRefund(purchaseId: string) {
    if (!window.confirm("Request a refund for this purchase? Access time from this pack will be removed.")) {
      return;
    }
    setBusyId(purchaseId);
    setError(null);
    try {
      const res = await fetch("/api/billing/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Refund failed.");
        setBusyId(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error requesting refund.");
    } finally {
      setBusyId(null);
    }
  }

  if (!purchases.length) {
    return (
      <p className="mt-4 text-sm text-[#65736d]">
        No purchases yet. Packs you buy will show here with refund options for 24 hours.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-[#17201e]/10 rounded-2xl border border-[#17201e]/10 bg-white/70">
        {purchases.map((p) => {
          const refundable = canRequestRefund({
            status: p.status,
            paidAt: p.paidAt,
          }).ok;
          const when = p.paidAt ?? p.createdAt;
          return (
            <li
              key={p.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {packLabel(p.pack, p.days)} · {formatUsd(p.amountCents)}
                </p>
                <p className="mt-0.5 text-xs text-[#65736d]">
                  {statusLabel(p.status)} ·{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(when))}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-[#8a9690]">
                  {p.id}
                </p>
              </div>
              {refundable ? (
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void requestRefund(p.id)}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-[#17201e]/15 px-4 text-xs font-semibold disabled:opacity-60"
                >
                  {busyId === p.id ? "Requesting…" : "Request refund"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-[#65736d]">
        Refunds can be requested within 24 hours of payment. After that the button
        is hidden and the server rejects the request.
      </p>
    </div>
  );
}
