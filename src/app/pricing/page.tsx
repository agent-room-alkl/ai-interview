import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  hasActiveAccess,
  TRIAL_DURATION_MINUTES,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { PricingPackPicker } from "@/components/PricingPackPicker";

export const metadata = {
  title: "Pricing",
  description:
    "Buy one-time Ainterv practice access: 1 day $3, 1 week $9 (best value), or 1 month $19. Stack packs anytime. New users get one free 10-minute trial.",
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
            One-time purchases — not subscriptions. Click a pack to select it
            (hover and selection update the card).{" "}
            <strong className="font-semibold text-[#17201e]">$9 / 1 week</strong>{" "}
            is best value. Each card has its own buy button. New accounts get one
            free {TRIAL_DURATION_MINUTES}-minute trial.
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

        <PricingPackPicker
          signedIn={Boolean(session?.user)}
          trialHref="/interview/new"
          showFreeTrial={false}
          signupHref="/signup"
        />

        <p className="mt-8 text-xs leading-5 text-[#65736d]">
          Secure checkout via Stripe. Access starts as soon as payment succeeds
          and stacks if you already have remaining time. Refunds within 24 hours.
        </p>
      </div>
    </main>
  );
}
