import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  ACCESS_PACKS,
  FEATURED_PACK_ID,
  formatUsd,
  hasActiveAccess,
  PACK_IDS,
  TRIAL_DURATION_MINUTES,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { BuyPackButton } from "@/components/BuyPackButton";

export const metadata = {
  title: "Pricing",
  description:
    "Buy one-time Ainterv practice access: 1 day $3, 1 week $9, or 1 month $19. Stack packs anytime. New users get one free 10-minute trial.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ cancelled?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const session = await auth();
  let accessUntil: Date | null = null;
  let trialUsed = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accessUntil: true, trialUsed: true },
    });
    accessUntil = user?.accessUntil ?? null;
    trialUsed = user?.trialUsed ?? false;
  }
  const active = hasActiveAccess(accessUntil);

  return (
    <main className="min-h-dvh bg-[#f6f5f0] text-[#17201e]">
      <div className="safe-px mx-auto max-w-5xl px-4 py-10 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex">
            <Logo />
          </Link>
          <div className="flex items-center gap-3 text-sm font-semibold">
            {session?.user ? (
              <Link href="/dashboard" className="underline underline-offset-4">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="underline underline-offset-4">
                Sign in
              </Link>
            )}
          </div>
        </header>

        <section className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e57b4f]">
            Pricing
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
            Practice access packs. Buy once, stack anytime.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#65736d] sm:text-base sm:leading-7">
            One-time purchases — not subscriptions. Each pack extends your access
            window. While access is active you can start unlimited 10 / 20 / 30
            minute practice or interview sessions. New accounts get one free{" "}
            {TRIAL_DURATION_MINUTES}-minute trial.
          </p>

          {params.cancelled ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Checkout cancelled — no charge. Pick a pack when you&apos;re ready.
            </p>
          ) : null}

          {session?.user ? (
            <p className="mt-4 text-sm text-[#65736d]">
              {active && accessUntil ? (
                <>
                  Your access is active until{" "}
                  <strong className="text-[#17201e]">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(accessUntil)}
                  </strong>
                  . Buying another pack stacks more time.
                </>
              ) : trialUsed ? (
                <>Free trial used. Buy a pack to keep practicing.</>
              ) : (
                <>
                  Free trial available: one {TRIAL_DURATION_MINUTES}-minute
                  session (20/30 min locked until you buy).
                </>
              )}
            </p>
          ) : null}
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {PACK_IDS.map((id) => {
            const pack = ACCESS_PACKS[id];
            const highlight = id === FEATURED_PACK_ID;
            return (
              <article
                key={id}
                className={`flex flex-col rounded-3xl border p-6 ${
                  highlight
                    ? "border-[#17201e] bg-[#17201e] text-[#f6f5f0] shadow-[0_20px_50px_-28px_rgba(23,32,30,0.55)]"
                    : "border-[#17201e]/10 bg-white/70"
                }`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                    highlight ? "text-[#d7f16a]" : "text-[#65736d]"
                  }`}
                >
                  {pack.name}
                  {highlight ? " · most popular" : ""}
                </p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
                  {formatUsd(pack.amountCents)}
                </p>
                <p
                  className={`mt-1 text-sm ${
                    highlight ? "text-[#a9bbb2]" : "text-[#65736d]"
                  }`}
                >
                  {pack.days} day{pack.days === 1 ? "" : "s"} · one-time
                </p>
                <p
                  className={`mt-3 text-sm leading-6 ${
                    highlight ? "text-[#c2d0c9]" : "text-[#65736d]"
                  }`}
                >
                  {pack.blurb}
                </p>
                <ul
                  className={`mt-4 flex-1 space-y-2 text-sm leading-6 ${
                    highlight ? "text-[#c2d0c9]" : "text-[#65736d]"
                  }`}
                >
                  {pack.features.map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>
                <div className="mt-6">
                  {session?.user ? (
                    <BuyPackButton
                      pack={id}
                      label={`Buy ${pack.name} — ${formatUsd(pack.amountCents)}`}
                      className={
                        highlight
                          ? "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e] disabled:opacity-60"
                          : undefined
                      }
                    />
                  ) : (
                    <Link
                      href="/signup"
                      className={
                        highlight
                          ? "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e]"
                          : "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17201e] px-5 py-3 text-sm font-semibold text-[#f6f5f0]"
                      }
                    >
                      Sign up to buy
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <p className="mt-8 text-xs leading-5 text-[#65736d]">
          Secure checkout via Stripe. Access starts as soon as payment succeeds
          and stacks if you already have remaining time.
        </p>
      </div>
    </main>
  );
}
