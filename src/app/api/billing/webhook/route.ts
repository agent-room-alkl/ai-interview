import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { extendAccessUntil, isPackId, shortenAccessUntil } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured" },
      { status: 503 },
    );
  }

  const stripe = getStripe();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const checkout = event.data.object as Stripe.Checkout.Session;
    await fulfillCheckoutSession(checkout);
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    await fulfillRefund(charge);
  }

  return NextResponse.json({ received: true });
}

async function fulfillRefund(charge: Stripe.Charge) {
  const paymentIntent =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!paymentIntent) return;

  const purchase = await prisma.purchase.findFirst({
    where: { stripePaymentIntent: paymentIntent },
  });
  if (!purchase || purchase.status === "refunded") return;

  const user = await prisma.user.findUnique({
    where: { id: purchase.userId },
    select: { accessUntil: true },
  });
  const nextAccess = shortenAccessUntil(user?.accessUntil, purchase.days);
  const refundId =
    Array.isArray(charge.refunds?.data) && charge.refunds.data[0]
      ? charge.refunds.data[0].id
      : purchase.stripeRefundId;

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        status: "refunded",
        refundedAt: new Date(),
        stripeRefundId: refundId ?? undefined,
      },
    });
    await tx.user.update({
      where: { id: purchase.userId },
      data: { accessUntil: nextAccess },
    });
  });
}

async function fulfillCheckoutSession(checkout: Stripe.Checkout.Session) {
  if (checkout.payment_status && checkout.payment_status !== "paid") {
    return;
  }

  const sessionId = checkout.id;
  const meta = checkout.metadata ?? {};
  const userId = meta.userId;
  const pack = meta.pack;
  const purchaseId = meta.purchaseId;
  const days = Number(meta.days);

  if (!userId || !isPackId(pack) || !Number.isFinite(days) || days <= 0) {
    console.error("[billing/webhook] missing metadata on session", sessionId);
    return;
  }

  const existing = await prisma.purchase.findFirst({
    where: {
      OR: [
        { stripeCheckoutSession: sessionId },
        ...(purchaseId ? [{ id: purchaseId }] : []),
      ],
    },
  });
  if (existing?.status === "paid") {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessUntil: true },
  });
  if (!user) {
    console.error("[billing/webhook] unknown user", userId);
    return;
  }

  const accessUntil = extendAccessUntil(user.accessUntil, days);
  const paymentIntent =
    typeof checkout.payment_intent === "string"
      ? checkout.payment_intent
      : checkout.payment_intent?.id ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { accessUntil },
    });

    if (existing) {
      await tx.purchase.update({
        where: { id: existing.id },
        data: {
          status: "paid",
          paidAt: new Date(),
          stripeCheckoutSession: sessionId,
          stripePaymentIntent: paymentIntent,
          days,
          pack,
        },
      });
    } else {
      await tx.purchase.create({
        data: {
          userId,
          pack,
          days,
          amountCents: checkout.amount_total ?? 0,
          currency: checkout.currency ?? "usd",
          status: "paid",
          paidAt: new Date(),
          stripeCheckoutSession: sessionId,
          stripePaymentIntent: paymentIntent,
        },
      });
    }
  });
}
