import { T } from "@/components/LanguageProvider";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  hasActiveAccess,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { PricingPackPicker } from "@/components/PricingPackPicker";

export const metadata = {
  title: "Pricing",
  description:
    "Buy one-time Ainterv practice access: 1 week $3 or 1 month $9. Stack packs anytime. New users get a free 24-hour trial.",
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
  let trialEndsAt: Date | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accessUntil: true, trialUsed: true, trialEndsAt: true },
    });
    accessUntil = user?.accessUntil ?? null;
    trialUsed = user?.trialUsed ?? false;
    trialEndsAt = user?.trialEndsAt ?? null;
  }
  if (hasActiveAccess(trialEndsAt) && (!accessUntil || trialEndsAt! > accessUntil)) accessUntil = trialEndsAt;
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
              <Link href="/dashboard" className="underline underline-offset-4"><T>{"Dashboard"}</T></Link>
            ) : (
              <Link href="/login" className="underline underline-offset-4"><T>{"Sign in"}</T></Link>
            )}
          </div>
        </header>

        <section className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e57b4f]"><T>{"Pricing"}</T></p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl"><T>{"Practice access packs. Buy once, stack anytime."}</T></h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#65736d] sm:text-base sm:leading-7"><T>{"One-time purchases — not subscriptions. Click a pack to select it (hover and selection update the card)."}</T>{" "}
            <strong className="font-semibold text-[#17201e]"><T>{"$3 / 1 week"}</T></strong>{" "}
            <T>{"New accounts get 24 hours of unlimited practice, starting with their first session."}</T>
          </p>

          {params.cancelled ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><T>{"Checkout cancelled — no charge. Pick a pack when you're ready."}</T></p>
          ) : null}

          {session?.user ? (
            <p className="mt-4 text-sm text-[#65736d]">
              {active && accessUntil ? (
                <><T>{"Your access is active until"}</T>{" "}
                  <strong className="text-[#17201e]">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(accessUntil)}
                  </strong><T>{". Buying another pack stacks more time."}</T></>
              ) : trialUsed ? (
                <><T>{"Free trial used. Buy a pack to keep practicing."}</T></>
              ) : (
                <>
                  <T>{"Free trial: 24 hours of unlimited 10 / 20 / 30 minute sessions from your first practice."}</T>
                </>
              )}
            </p>
          ) : null}
        </section>

        <PricingPackPicker
          signedIn={Boolean(session?.user)}
          trialHref="/interview/new"
          showFreeTrial={!trialUsed}
          signupHref="/signup"
        />

        <p className="mt-8 text-xs leading-5 text-[#65736d]"><T>{"Secure checkout via Stripe. On the Stripe payment page you can add a promotion code when one is available. Access starts as soon as payment succeeds and stacks if you already have remaining time. Refunds within 24 hours."}</T></p>
      </div>
    </main>
  );
}
