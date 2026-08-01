-- AlterTable
ALTER TABLE "ai_interview"."User" ADD COLUMN "accessUntil" TIMESTAMP(3),
ADD COLUMN "trialUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "ai_interview"."Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pack" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeCheckoutSession" TEXT,
    "stripePaymentIntent" TEXT,
    "stripeRefundId" TEXT,
    "refundRequestedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_stripeCheckoutSession_key" ON "ai_interview"."Purchase"("stripeCheckoutSession");

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "ai_interview"."Purchase"("userId");

-- AddForeignKey
ALTER TABLE "ai_interview"."Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ai_interview"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
