import type Stripe from "stripe";
import { extendAccessUntil, isPackId, shortenAccessUntil } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export type FulfillOutcome = "granted" | "already_fulfilled" | "skipped";

export type FulfillResult = {
  outcome: FulfillOutcome;
  accessUntil: Date | null;
};

type CheckoutLike = Pick<
  Stripe.Checkout.Session,
  "id" | "payment_status" | "metadata" | "amount_total" | "currency" | "payment_intent"
>;

/**
 * Atomically mark a checkout paid and extend access **once**.
 * Webhook + success page both call this; only the first claimer grants days.
 */
export async function fulfillPaidCheckoutSession(
  checkout: CheckoutLike,
): Promise<FulfillResult> {
  if (checkout.payment_status && checkout.payment_status !== "paid") {
    return { outcome: "skipped", accessUntil: null };
  }

  const sessionId = checkout.id;
  const meta = checkout.metadata ?? {};
  const userId = meta.userId;
  const pack = meta.pack;
  const purchaseId = meta.purchaseId;
  const days = Number(meta.days);

  if (!userId || !isPackId(pack) || !Number.isFinite(days) || days <= 0) {
    console.error("[billing] fulfill missing metadata", sessionId);
    return { outcome: "skipped", accessUntil: null };
  }

  const paymentIntent =
    typeof checkout.payment_intent === "string"
      ? checkout.payment_intent
      : checkout.payment_intent?.id ?? null;
  const amountCents = checkout.amount_total ?? 0;
  const currency = checkout.currency ?? "usd";

  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findFirst({
      where: {
        OR: [
          { stripeCheckoutSession: sessionId },
          ...(purchaseId ? [{ id: purchaseId }] : []),
        ],
      },
    });

    if (existing && (existing.status === "paid" || existing.status === "refunded")) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { accessUntil: true },
      });
      return {
        outcome: "already_fulfilled" as const,
        accessUntil: user?.accessUntil ?? null,
      };
    }

    let claimed = false;

    if (existing) {
      const res = await tx.purchase.updateMany({
        where: {
          id: existing.id,
          status: { in: ["pending", "failed"] },
        },
        data: {
          status: "paid",
          paidAt: new Date(),
          stripeCheckoutSession: sessionId,
          stripePaymentIntent: paymentIntent,
          pack,
          days,
          amountCents: amountCents || existing.amountCents,
          currency,
        },
      });
      claimed = res.count === 1;
    } else {
      try {
        await tx.purchase.create({
          data: {
            userId,
            pack,
            days,
            amountCents,
            currency,
            status: "paid",
            paidAt: new Date(),
            stripeCheckoutSession: sessionId,
            stripePaymentIntent: paymentIntent,
          },
        });
        claimed = true;
      } catch {
        // Unique stripeCheckoutSession — concurrent fulfill already won.
        claimed = false;
      }
    }

    if (!claimed) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { accessUntil: true },
      });
      return {
        outcome: "already_fulfilled" as const,
        accessUntil: user?.accessUntil ?? null,
      };
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { accessUntil: true },
    });
    if (!user) {
      throw new Error(`[billing] unknown user ${userId}`);
    }

    const accessUntil = extendAccessUntil(user.accessUntil, days);
    await tx.user.update({
      where: { id: userId },
      data: { accessUntil },
    });

    return { outcome: "granted" as const, accessUntil };
  });
}

/**
 * Atomically mark refunded and shorten access once (API + charge.refunded).
 */
export async function fulfillPurchaseRefund(opts: {
  purchaseId: string;
  refundId?: string | null;
  paymentIntent?: string | null;
}): Promise<{ outcome: "refunded" | "already_refunded" | "not_found" }> {
  return prisma.$transaction(async (tx) => {
    const purchase = opts.purchaseId
      ? await tx.purchase.findUnique({ where: { id: opts.purchaseId } })
      : opts.paymentIntent
        ? await tx.purchase.findFirst({
            where: { stripePaymentIntent: opts.paymentIntent },
          })
        : null;

    if (!purchase) return { outcome: "not_found" as const };
    if (purchase.status === "refunded") {
      return { outcome: "already_refunded" as const };
    }

    const claimed = await tx.purchase.updateMany({
      where: {
        id: purchase.id,
        status: { in: ["paid", "refund_requested"] },
      },
      data: {
        status: "refunded",
        refundedAt: new Date(),
        ...(opts.refundId ? { stripeRefundId: opts.refundId } : {}),
      },
    });

    if (claimed.count !== 1) {
      return { outcome: "already_refunded" as const };
    }

    const user = await tx.user.findUnique({
      where: { id: purchase.userId },
      select: { accessUntil: true },
    });
    const nextAccess = shortenAccessUntil(user?.accessUntil, purchase.days);
    await tx.user.update({
      where: { id: purchase.userId },
      data: { accessUntil: nextAccess },
    });

    return { outcome: "refunded" as const };
  });
}
