import Link from "next/link";

export const metadata = {
  title: "Terms of Service · ai interview",
  description: "Terms of Service for the ai interview practice product.",
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
              5. Free and paid access
            </h2>
            <p className="mt-2">
              Core practice may be available free during early access. Paid plans,
              if introduced, will be described before purchase. Time limits or
              feature gates may apply to free accounts.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#17201e]">
              6. Disclaimer
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
              7. Contact
            </h2>
            <p className="mt-2">
              Questions about these terms: reach us via the product support
              channels listed on the site.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
