import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPack, isPackId, type PackId } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured yet (missing STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  let packId: PackId | null = null;
  try {
    const body = (await req.json()) as { pack?: string };
    if (body.pack && isPackId(body.pack)) packId = body.pack;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!packId) {
    return NextResponse.json(
      { error: "Choose a pack: day, week, or month." },
      { status: 400 },
    );
  }

  const pack = getPack(packId);
  const site = getSiteUrl();
  const stripe = getStripe();

  const purchase = await prisma.purchase.create({
    data: {
      userId: session.user.id,
      pack: pack.id,
      days: pack.days,
      amountCents: pack.amountCents,
      currency: "usd",
      status: "pending",
    },
  });

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: session.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pack.amountCents,
            product_data: {
              name: `Ainterv practice — ${pack.name}`,
              description: pack.blurb,
            },
          },
        },
      ],
      metadata: {
        userId: session.user.id,
        pack: pack.id,
        days: String(pack.days),
        purchaseId: purchase.id,
      },
      // Lets buyers enter Stripe Promotion codes (e.g. DAY1 → $1 day intro).
      allow_promotion_codes: true,
      success_url: `${site}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/pricing?cancelled=1`,
    });

    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { stripeCheckoutSession: checkout.id },
    });

    if (!checkout.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }
    return NextResponse.json({ url: checkout.url, sessionId: checkout.id });
  } catch (err) {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: "failed" },
    });
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
