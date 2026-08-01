"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ACCESS_PACKS,
  FEATURED_PACK_ID,
  formatUsd,
  PACK_IDS,
  type PackId,
} from "@/lib/billing";
import { BuyPackButton } from "@/components/BuyPackButton";

type Props = {
  signedIn: boolean;
  /** Where free-trial CTA goes when signed in */
  trialHref: string;
  showFreeTrial?: boolean;
  signupHref?: string;
};

export function PricingPackPicker({
  signedIn,
  trialHref,
  showFreeTrial = true,
  signupHref = "/signup",
}: Props) {
  const [selected, setSelected] = useState<PackId | "trial">(
    showFreeTrial ? FEATURED_PACK_ID : FEATURED_PACK_ID,
  );
  const [hovered, setHovered] = useState<PackId | "trial" | null>(null);

  function cardClass(id: PackId | "trial", highlightDefault: boolean) {
    const isSelected = selected === id;
    const isHovered = hovered === id;
    const active = isSelected || (isHovered && selected !== id);
    if (id === "trial") {
      return [
        "flex flex-col rounded-3xl border p-5 transition-all duration-150 outline-none",
        "cursor-pointer focus-visible:ring-2 focus-visible:ring-[#d7f16a] focus-visible:ring-offset-2",
        isSelected
          ? "border-[#17201e] bg-white shadow-[0_16px_40px_-24px_rgba(23,32,30,0.45)] scale-[1.02]"
          : "border-dashed border-[#17201e]/25 bg-white/40 hover:border-[#17201e]/50 hover:bg-white/70",
        active && !isSelected ? "border-[#17201e]/40 bg-white/80" : "",
      ].join(" ");
    }
    if (isSelected) {
      return [
        "flex flex-col rounded-3xl border p-5 transition-all duration-150 outline-none cursor-pointer",
        "focus-visible:ring-2 focus-visible:ring-[#d7f16a] focus-visible:ring-offset-2",
        "border-[#17201e] bg-[#17201e] text-[#f6f5f0] shadow-[0_20px_50px_-28px_rgba(23,32,30,0.55)] scale-[1.02]",
      ].join(" ");
    }
    return [
      "flex flex-col rounded-3xl border p-5 transition-all duration-150 outline-none cursor-pointer",
      "focus-visible:ring-2 focus-visible:ring-[#d7f16a] focus-visible:ring-offset-2",
      "border-[#17201e]/10 bg-white/70 hover:border-[#17201e]/35 hover:bg-white hover:-translate-y-0.5 hover:shadow-md",
      highlightDefault && !isSelected ? "ring-1 ring-[#d7f16a]/50" : "",
    ].join(" ");
  }

  function muted(id: PackId | "trial") {
    return selected === id ? "text-[#a9bbb2]" : "text-[#65736d]";
  }

  function bodyMuted(id: PackId | "trial") {
    return selected === id ? "text-[#c5d4cd]" : "text-[#65736d]";
  }

  function labelClass(id: PackId | "trial") {
    return selected === id
      ? "text-[#d7f16a]"
      : "text-[#65736d]";
  }

  return (
    <div
      className={`mt-8 grid gap-4 sm:grid-cols-2 ${
        showFreeTrial ? "xl:grid-cols-4" : "md:grid-cols-3"
      }`}
    >
      {showFreeTrial ? (
        <article
          role="button"
          tabIndex={0}
          aria-pressed={selected === "trial"}
          className={cardClass("trial", false)}
          onClick={() => setSelected("trial")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelected("trial");
            }
          }}
          onMouseEnter={() => setHovered("trial")}
          onMouseLeave={() => setHovered(null)}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#65736d]">
            Free trial
          </p>
          <p className="mt-4 text-3xl font-semibold tracking-[-0.05em]">$0</p>
          <p className="mt-1 text-sm text-[#65736d]">1× 10 minutes</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm leading-6 text-[#65736d]">
            <li>· One trial session per account</li>
            <li>· AI interviewer (voice)</li>
            <li>· AI practice coach</li>
            <li>· Résumé-aware questions</li>
            <li>· 20 / 30 min unlock after purchase</li>
          </ul>
          <Link
            href={signedIn ? trialHref : signupHref}
            className={`mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors ${
              selected === "trial"
                ? "bg-[#17201e] text-[#f6f5f0]"
                : "border border-[#17201e]/15 hover:bg-[#17201e]/5"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            Start free trial
          </Link>
        </article>
      ) : null}

      {PACK_IDS.map((id) => {
        const pack = ACCESS_PACKS[id];
        const isFeatured = id === FEATURED_PACK_ID;
        const isSelected = selected === id;
        return (
          <article
            key={id}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            className={cardClass(id, isFeatured)}
            onClick={() => setSelected(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelected(id);
              }
            }}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-[0.14em] ${labelClass(id)}`}
            >
              {pack.name}
              {isFeatured ? " · best value" : ""}
            </p>
            <p className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
              {formatUsd(pack.amountCents)}
            </p>
            <p className={`mt-1 text-sm ${muted(id)}`}>
              {pack.days} day{pack.days === 1 ? "" : "s"} access · one-time
            </p>
            <ul className={`mt-4 flex-1 space-y-2 text-sm leading-6 ${bodyMuted(id)}`}>
              {pack.features.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
            <div className="mt-6" onClick={(e) => e.stopPropagation()}>
              {signedIn ? (
                <BuyPackButton
                  pack={id}
                  label={`Buy ${pack.name} — ${formatUsd(pack.amountCents)}`}
                  className={
                    isSelected
                      ? "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e] disabled:opacity-60"
                      : "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17201e] px-5 py-3 text-sm font-semibold text-[#f6f5f0] disabled:opacity-60"
                  }
                />
              ) : (
                <Link
                  href={signupHref}
                  className={
                    isSelected
                      ? "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e]"
                      : "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17201e] px-5 py-3 text-sm font-semibold text-[#f6f5f0]"
                  }
                >
                  Buy {pack.name}
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
