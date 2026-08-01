import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Ainterv AI interview practice.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-[#65736d]">Last updated: July 28, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-[#52605a] sm:text-base sm:leading-8">
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              1. What we collect
            </h2>
            <p className="mt-2">
              Account details (such as email via our auth provider), résumés you
              upload, interview answers (voice and text), device/browser basics,
              and usage events needed to run and improve the product.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              2. How we use data
            </h2>
            <p className="mt-2">
              We use your data to authenticate you, generate interview questions,
              transcribe speech, score practice answers, show coaching feedback,
              and keep session history. We may use aggregated, de-identified
              signals to improve quality.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              3. Processors
            </h2>
            <p className="mt-2">
              We rely on infrastructure and AI providers (hosting, auth, speech,
              and language models) that process data on our behalf under
              contractual safeguards. We do not sell your personal information.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              4. Retention
            </h2>
            <p className="mt-2">
              We keep account and session data while your account is active and
              for a reasonable period afterward for security, billing disputes,
              and legal obligations. You may request deletion of account-linked
              practice data where applicable.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              5. Your choices
            </h2>
            <p className="mt-2">
              You can update profile details through your account provider, stop
              using the product, or contact us to request access or deletion
              subject to applicable law.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              6. Children
            </h2>
            <p className="mt-2">
              The service is not directed at children under 16. If you believe a
              child provided data, contact us so we can delete it.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              7. Contact
            </h2>
            <p className="mt-2">
              Privacy requests: use the support channels listed on the site.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
