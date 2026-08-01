import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { extendAccessUntil, isPackId } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const metadata = {
  title: "Payment success",
  robots: { index: false, follow: false },
};

/**
 * Success landing after Stripe Checkout. Also fulfills access if the webhook
 * has not landed yet (best-effort; webhook remains source of truth in prod).
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ session_id?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = searchParams ? await searchParams : {};
  const sessionId = params.session_id?.trim();
  let accessUntil: Date | null = null;
  let fulfilled = false;

  if (sessionId && stripeConfigured()) {
    try {
      const stripe = getStripe();
      const checkout = await stripe.checkout.sessions.retrieve(sessionId);
      if (
        checkout.payment_status === "paid" &&
        checkout.metadata?.userId === session.user.id
      ) {
        const existing = await prisma.purchase.findFirst({
          where: { stripeCheckoutSession: sessionId },
        });
        if (existing?.status === "paid") {
          fulfilled = true;
        } else {
          const pack = checkout.metadata?.pack;
          const days = Number(checkout.metadata?.days);
          if (isPackId(pack) && Number.isFinite(days) && days > 0) {
            const user = await prisma.user.findUnique({
              where: { id: session.user.id },
              select: { accessUntil: true },
            });
            const next = extendAccessUntil(user?.accessUntil, days);
            const paymentIntent =
              typeof checkout.payment_intent === "string"
                ? checkout.payment_intent
                : checkout.payment_intent?.id ?? null;
            await prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: session.user.id },
                data: { accessUntil: next },
              });
              if (existing) {
                await tx.purchase.update({
                  where: { id: existing.id },
                  data: {
                    status: "paid",
                    paidAt: new Date(),
                    stripeCheckoutSession: sessionId,
                    stripePaymentIntent: paymentIntent,
                  },
                });
              }
            });
            accessUntil = next;
            fulfilled = true;
          }
        }
      }
    } catch {
      // fall through — show generic success
    }
  }

  if (!accessUntil) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accessUntil: true },
    });
    accessUntil = user?.accessUntil ?? null;
  }

  return (
    <main className="min-h-dvh bg-[#f6f5f0] text-[#17201e]">
      <div className="safe-px mx-auto max-w-xl px-4 py-12 sm:px-10">
        <Link href="/" className="inline-flex">
          <Logo />
        </Link>
        <h1 className="mt-10 text-3xl font-semibold tracking-[-0.05em]">
          {fulfilled ? "You're all set" : "Thanks for your purchase"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#65736d]">
          {accessUntil
            ? `Practice access is active until ${new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(accessUntil)}.`
            : "If payment just completed, access may take a few seconds to appear — refresh the dashboard shortly."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/interview/new"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17201e] px-5 py-3 text-sm font-semibold text-[#f6f5f0]"
          >
            Start practicing
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#17201e]/15 px-5 py-3 text-sm font-semibold"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
