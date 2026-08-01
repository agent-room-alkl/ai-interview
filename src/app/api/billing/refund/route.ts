import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canRequestRefund } from "@/lib/billing";
import { fulfillPurchaseRefund } from "@/lib/billing-fulfill";
import { prisma } from "@/lib/prisma";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured yet." },
      { status: 503 },
    );
  }

  let purchaseId = "";
  try {
    const body = (await req.json()) as { purchaseId?: string };
    purchaseId = String(body.purchaseId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!purchaseId) {
    return NextResponse.json({ error: "purchaseId required." }, { status: 400 });
  }

  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, userId: session.user.id },
  });
  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  }

  const gate = canRequestRefund({
    status: purchase.status,
    paidAt: purchase.paidAt,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: 400 });
  }
  if (!purchase.stripePaymentIntent) {
    return NextResponse.json(
      { error: "Missing payment reference for refund." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  try {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: "refund_requested", refundRequestedAt: new Date() },
    });

    const refund = await stripe.refunds.create({
      payment_intent: purchase.stripePaymentIntent,
      metadata: {
        purchaseId: purchase.id,
        userId: session.user.id,
      },
    });

    const result = await fulfillPurchaseRefund({
      purchaseId: purchase.id,
      refundId: refund.id,
      paymentIntent: purchase.stripePaymentIntent,
    });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accessUntil: true },
    });

    return NextResponse.json({
      ok: true,
      refundId: refund.id,
      outcome: result.outcome,
      accessUntil: user?.accessUntil?.toISOString() ?? null,
    });
  } catch (err) {
    await prisma.purchase
      .update({
        where: { id: purchase.id },
        data: { status: "paid", refundRequestedAt: null },
      })
      .catch(() => undefined);
    const message = err instanceof Error ? err.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
