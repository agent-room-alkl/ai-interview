import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  fulfillPaidCheckoutSession,
  fulfillPurchaseRefund,
} from "@/lib/billing-fulfill";
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
    await fulfillPaidCheckoutSession(checkout);
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntent =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;
    const refundId =
      Array.isArray(charge.refunds?.data) && charge.refunds.data[0]
        ? charge.refunds.data[0].id
        : null;
    if (paymentIntent) {
      await fulfillPurchaseRefund({
        purchaseId: "",
        paymentIntent,
        refundId,
      });
    }
  }

  return NextResponse.json({ received: true });
}
