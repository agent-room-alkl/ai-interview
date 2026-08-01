import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BuyPackButton } from "@/components/BuyPackButton";
import { Logo } from "@/components/Logo";
import {
  ACCESS_PACKS,
  FEATURED_PACK_ID,
  formatUsd,
  PACK_IDS,
} from "@/lib/billing";
import {
  SITE_DEFAULT_TITLE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  getSiteUrl,
} from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: SITE_DEFAULT_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
};

const features = [
  {
    number: "01",
    title: "Resume-aware sessions",
    text: "Upload your résumé and get a focused interview plan built around your experience and target role.",
  },
  {
    number: "02",
    title: "Practice with a trainer",
    text: "Switch to Practice mode for a second AI voice that turns every answer into a clear, repeatable improvement.",
  },
  {
    number: "03",
    title: "Speak naturally",
    text: "Low-latency voice, an always-ready microphone, and interruption handling keep the conversation flowing.",
  },
];

const guideSteps = [
  {
    step: "1",
    title: "Create an account",
    text: "Sign up, then start a new interview from your dashboard.",
  },
  {
    step: "2",
    title: "Upload your résumé",
    text: "We detect language and roles, then build questions around your background.",
  },
  {
    step: "3",
    title: "Talk through the room",
    text: "Answer out loud. Use Practice mode when you want coaching and a higher bar before moving on.",
  },
  {
    step: "4",
    title: "Review and retry",
    text: "Rehearse weak spots, switch expression level anytime, and keep sessions in a quiet space.",
  },
];

const languages = [
  "English",
  "中文",
  "Español",
  "Français",
  "Deutsch",
  "日本語",
  "한국어",
  "Português",
];

export default async function Home() {
  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session.userId;
  } catch {
    // Auth failure should not crash the public landing page.
  }
  const siteUrl = getSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        alternateName: ["Ainterv.com", "AI Interview"],
        url: siteUrl,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: SITE_DESCRIPTION,
        slogan: SITE_TAGLINE,
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "0",
          highPrice: "19",
          priceCurrency: "USD",
          offerCount: "4",
          offers: [
            {
              "@type": "Offer",
              name: "Free 10-minute trial",
              price: "0",
              priceCurrency: "USD",
            },
            ...PACK_IDS.map((id) => ({
              "@type": "Offer" as const,
              name: `Practice access — ${ACCESS_PACKS[id].name}`,
              price: String(ACCESS_PACKS[id].amountCents / 100),
              priceCurrency: "USD",
            })),
          ],
        },
      },
      {
        "@type": "Organization",
        name: SITE_NAME,
        url: siteUrl,
      },
    ],
  };
  return (
    <main className="min-h-dvh overflow-x-clip bg-[#f6f5f0] text-[#17201e]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="safe-px relative mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-10 sm:pb-20 sm:pt-6 lg:px-16">
        <div className="pointer-events-none absolute -right-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#d9f0e7] blur-3xl" />
        <nav className="relative z-10 flex items-center justify-between gap-3 border-b border-[#17201e]/10 pb-4 sm:pb-5">
          <Link href="/" className="min-w-0">
            <Logo />
          </Link>
          <div className="flex shrink-0 items-center gap-3 text-sm font-medium leading-none sm:gap-5">
            <a
              className="hidden transition-opacity hover:opacity-60 sm:inline"
              href="#how-it-works"
            >
              How it works
            </a>
            <a
              className="hidden transition-opacity hover:opacity-60 sm:inline"
              href="#pricing"
            >
              Pricing
            </a>
            <a
              className="hidden transition-opacity hover:opacity-60 md:inline"
              href="#guide"
            >
              Guide
            </a>
            {userId ? (
              <>
                <Link
                  className="inline-flex min-h-11 items-center px-1 py-2 transition-opacity hover:opacity-60"
                  href="/dashboard"
                >
                  Dashboard
                </Link>
                <span className="flex items-center">
                  <UserButton />
                </span>
              </>
            ) : (
              <>
                <Link
                  className="inline-flex min-h-11 items-center px-1 py-2 transition-opacity hover:opacity-60"
                  href="/login"
                >
                  Log in
                </Link>
                <Link
                  className="inline-flex min-h-11 items-center rounded-full bg-[#d7f16a] px-3.5 py-2.5 transition-transform hover:-translate-y-0.5 sm:px-4"
                  href="/signup"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>

        <div className="relative z-10 grid gap-10 pb-16 pt-12 sm:gap-12 sm:pb-24 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:pt-28">
          <div>
            <p className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#65736d] sm:mb-7 sm:text-xs sm:tracking-[0.2em]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#e57b4f]" />{" "}
              Voice-first interview practice
            </p>
            <h1 className="max-w-4xl text-[2.75rem] font-semibold leading-[0.95] tracking-[-0.07em] sm:text-6xl sm:leading-[0.92] sm:tracking-[-0.075em] md:text-8xl">
              Make your next answer your best one.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#52605a] sm:mt-8 sm:text-lg sm:leading-8">
              A calm, realistic AI interview partner that knows your résumé,
              asks better questions, and helps you get sharper with every
              attempt.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Link
                href={userId ? "/interview/new" : "/signup"}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#17201e] px-6 py-3.5 text-sm font-semibold text-[#f6f5f0] transition-transform hover:-translate-y-0.5"
              >
                Start practicing <span className="ml-3">↗</span>
              </Link>
              <a
                href="#pricing"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#17201e]/20 px-6 py-3.5 text-sm font-semibold transition-colors hover:bg-white/60"
              >
                From $3 · free 10‑min trial
              </a>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#65736d] sm:text-sm">
              One free 10-minute session · then $3/day · $9/week · $19/month
              (one-time, stackable)
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-md px-1 lg:mb-2 lg:px-0">
            <div className="rounded-[1.5rem] border border-[#17201e]/10 bg-[#e3eee7] p-2.5 shadow-[0_24px_70px_-30px_rgba(23,32,30,0.35)] sm:rounded-[2rem] sm:p-3">
              <div className="rounded-[1.25rem] bg-[#17201e] p-5 text-[#f6f5f0] sm:rounded-[1.5rem] sm:p-8">
                <div className="flex items-center justify-between text-xs text-[#a9bbb2]">
                  <span>LIVE SESSION</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#d7f16a]" />{" "}
                    00:14
                  </span>
                </div>
                <div className="mt-10 sm:mt-16">
                  <p className="text-sm text-[#a9bbb2]">AI Interviewer</p>
                  <p className="mt-3 text-xl leading-snug tracking-[-0.04em] sm:text-2xl">
                    “Tell me about a project you’re proud of.”
                  </p>
                </div>
                <div className="mt-12 flex items-center justify-between border-t border-white/10 pt-5 sm:mt-20">
                  <span className="text-xs text-[#a9bbb2]">Listening...</span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-3 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-5 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-8 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-5 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-3 w-1 rounded-full bg-[#d7f16a]" />
                  </span>
                </div>
                <div className="mt-5">
                  <span className="inline-flex rounded-full bg-[#e57b4f] px-3 py-1.5 text-[11px] font-semibold text-white sm:px-4 sm:py-2 sm:text-xs">
                    tailored to you
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="how-it-works"
          className="relative z-10 mt-4 grid gap-4 border-t border-[#17201e]/10 pt-10 md:grid-cols-3"
        >
          {features.map((feature) => (
            <article
              key={feature.number}
              className="rounded-2xl border border-[#17201e]/10 bg-white/35 p-6"
            >
              <p className="text-xs font-semibold text-[#e57b4f]">
                {feature.number}
              </p>
              <h2 className="mt-8 text-xl font-semibold tracking-[-0.04em]">
                {feature.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#65736d]">
                {feature.text}
              </p>
            </article>
          ))}
        </div>

        <section
          id="guide"
          className="relative z-10 mt-10 border-t border-[#17201e]/10 pt-10 sm:mt-14 sm:pt-14"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e57b4f]">
            How to use
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            From signup to sharper answers in four steps.
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {guideSteps.map((item) => (
              <li
                key={item.step}
                className="rounded-2xl border border-[#17201e]/10 bg-white/35 p-6"
              >
                <p className="text-xs font-semibold text-[#e57b4f]">
                  Step {item.step}
                </p>
                <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#65736d]">
                  {item.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="pricing"
          className="relative z-10 mt-10 border-t border-[#17201e]/10 pt-10 sm:mt-14 sm:pt-14"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e57b4f]">
            Pricing
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            One free 10-minute trial. Then simple one-time packs.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#65736d] sm:text-base sm:leading-7">
            New accounts get one free 10-minute session. Packs are one-time
            (not subscriptions) and stack. While access is active you get full
            AI interviewer + practice coach on 10 / 20 / 30 minute sessions.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="flex flex-col rounded-3xl border border-dashed border-[#17201e]/20 bg-white/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#65736d]">
                Free trial
              </p>
              <p className="mt-4 text-3xl font-semibold tracking-[-0.05em]">$0</p>
              <p className="mt-1 text-sm text-[#65736d]">1× 10 minutes</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm leading-6 text-[#65736d]">
                <li>· One trial session per account</li>
                <li>· AI interviewer (voice)</li>
                <li>· AI practice coach</li>
                <li>· Résumé-aware questions</li>
                <li>· 20 / 30 min unlock after purchase</li>
              </ul>
              <Link
                href={userId ? "/interview/new" : "/signup"}
                className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#17201e]/15 px-5 py-3 text-sm font-semibold"
              >
                Start free trial
              </Link>
            </article>
            {PACK_IDS.map((id) => {
              const pack = ACCESS_PACKS[id];
              const highlight = id === FEATURED_PACK_ID;
              return (
                <article
                  key={id}
                  className={`flex flex-col rounded-3xl border p-5 ${
                    highlight
                      ? "border-[#17201e] bg-[#17201e] text-[#f6f5f0] shadow-[0_20px_50px_-28px_rgba(23,32,30,0.55)]"
                      : "border-[#17201e]/10 bg-white/70"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                      highlight ? "text-[#d7f16a]" : "text-[#65736d]"
                    }`}
                  >
                    {pack.name}
                    {highlight ? " · most popular" : ""}
                  </p>
                  <p className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
                    {formatUsd(pack.amountCents)}
                  </p>
                  <p
                    className={`mt-1 text-sm ${
                      highlight ? "text-[#a9bbb2]" : "text-[#65736d]"
                    }`}
                  >
                    {pack.days} day{pack.days === 1 ? "" : "s"} access · one-time
                  </p>
                  <ul
                    className={`mt-4 flex-1 space-y-2 text-sm leading-6 ${
                      highlight ? "text-[#c5d4cd]" : "text-[#65736d]"
                    }`}
                  >
                    {pack.features.map((line) => (
                      <li key={line}>· {line}</li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    {userId ? (
                      <BuyPackButton
                        pack={id}
                        label={`Buy ${pack.name} — ${formatUsd(pack.amountCents)}`}
                        className={
                          highlight
                            ? "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e] disabled:opacity-60"
                            : "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17201e] px-5 py-3 text-sm font-semibold text-[#f6f5f0] disabled:opacity-60"
                        }
                      />
                    ) : (
                      <Link
                        href={`/signup?next=/pricing`}
                        className={
                          highlight
                            ? "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e]"
                            : "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17201e] px-5 py-3 text-sm font-semibold text-[#f6f5f0]"
                        }
                      >
                        Buy {pack.name}
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-[#65736d]">
            Prefer the full checkout page?{" "}
            <Link href="/pricing" className="font-semibold underline underline-offset-4">
              Open /pricing
            </Link>
            . Refunds available within 24 hours of purchase.
          </p>
        </section>

        <section
          id="languages"
          className="relative z-10 mt-10 border-t border-[#17201e]/10 pt-10 sm:mt-14 sm:pt-14"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e57b4f]">
            Multilingual
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            Interview in the language your résumé speaks.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#65736d] sm:text-base sm:leading-7">
            Upload your résumé and we detect the language automatically — then
            questions, voice recognition, and coaching follow that language so
            practice feels natural from the first turn.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2 sm:gap-3">
            {languages.map((lang) => (
              <li
                key={lang}
                className="rounded-full border border-[#17201e]/15 bg-white/50 px-3.5 py-2 text-sm font-medium text-[#17201e]"
              >
                {lang}
              </li>
            ))}
          </ul>
        </section>
      </section>
      <footer className="border-t border-[#17201e]/10 px-6 py-8 text-sm text-[#65736d] sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p>Your next interview starts with one good question.</p>
          <nav className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium sm:gap-6">
            <a className="hover:opacity-70" href="#guide">
              Guide
            </a>
            <a className="hover:opacity-70" href="#pricing">
              Pricing
            </a>
            <Link className="hover:opacity-70" href="/terms">
              Terms
            </Link>
            <Link className="hover:opacity-70" href="/privacy">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
