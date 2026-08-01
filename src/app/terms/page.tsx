import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Ainterv AI interview practice.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-[#f6f5f0] text-[#17201e]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
        <Link
          href="/"
          className="text-sm font-medium text-[#65736d] transition-opacity hover:opacity-70"
        >
          ← Back home
        </Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-[#65736d]">Last updated: July 28, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-[#52605a] sm:text-base sm:leading-8">
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              1. The service
            </h2>
            <p className="mt-2">
              ai interview provides AI-assisted interview practice, including voice
              conversation, coaching feedback, and related tools. The product is for
              practice and learning — not a guarantee of hiring outcomes.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              2. Accounts
            </h2>
            <p className="mt-2">
              You are responsible for activity under your account. Keep login
              credentials secure. We may suspend access for misuse, abuse, or
              violations of these terms.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              3. Acceptable use
            </h2>
            <p className="mt-2">
              Do not reverse-engineer the service, probe other users&apos; data,
              upload unlawful content, or use the product to harass anyone. Do not
              rely on practice sessions as legal, medical, or professional advice.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              4. Content you provide
            </h2>
            <p className="mt-2">
              You retain rights to résumés and answers you upload or speak. You
              grant us a limited license to process that content to run the
              service (transcription, coaching, scoring, and session history).
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              5. Free trial and paid access packs
            </h2>
            <p className="mt-2">
              New accounts receive one free trial session limited to{" "}
              <strong>10 minutes</strong>. The free trial does not include 20- or
              30-minute sessions. After the trial is used, you must purchase
              access to continue.
            </p>
            <p className="mt-2">
              Paid access is sold as one-time (non-subscription) practice packs
              priced in USD: <strong>$3 for 1 day</strong>,{" "}
              <strong>$9 for 7 days</strong>, and <strong>$19 for 30 days</strong>.
              Purchases stack by extending your account&apos;s access end time
              from the later of &quot;now&quot; or your current end time. While
              access is active you may start unlimited 10 / 20 / 30 minute
              practice or interview sessions subject to fair use and service
              availability.
            </p>
            <p className="mt-2">
              Payments are processed by Stripe. Purchase history (pack, amount,
              time, status) is shown in your dashboard. Prices do not include
              any taxes Stripe or local law may collect separately.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              6. Refunds
            </h2>
            <p className="mt-2">
              You may request a refund for a paid pack within{" "}
              <strong>24 hours</strong> of the successful payment time shown in
              your purchase history. Requests after that window are declined by
              the product automatically. Approved refunds are processed through
              Stripe; bank posting times vary. When a refund succeeds we remove
              the corresponding access days from your account (access will not
              extend beyond what remaining non-refunded packs support). Chargebacks
              or disputes may result in immediate suspension of access.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              7. Disclaimer
            </h2>
            <p className="mt-2">
              The service is provided &quot;as is.&quot; AI responses may be
              inaccurate or incomplete. We do not warrant uninterrupted
              availability or fitness for a particular purpose to the extent
              allowed by law.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              8. Contact
            </h2>
            <p className="mt-2">
              Questions about these terms, billing, or refunds: reach us via the
              product support channels listed on the site. These terms describe
              product policy and are not a substitute for advice from counsel in
              your jurisdiction.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
