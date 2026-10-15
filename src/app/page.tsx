import { T } from "@/components/LanguageProvider";
import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Logo } from "@/components/Logo";
import { PricingPackPicker } from "@/components/PricingPackPicker";
import { ACCESS_PACKS, PACK_IDS } from "@/lib/billing";
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
          highPrice: "9",
          priceCurrency: "USD",
          offerCount: "4",
          offers: [
            {
              "@type": "Offer",
              name: "Free 24-hour trial",
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
    <main className="isolate min-h-dvh overflow-x-clip bg-[#f6f5f0] text-[#17201e]">
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
            ><T>{"How it works"}</T></a>
            <a
              className="hidden transition-opacity hover:opacity-60 sm:inline"
              href="#pricing"
            ><T>{"Pricing"}</T></a>
            <a
              className="hidden transition-opacity hover:opacity-60 md:inline"
              href="#guide"
            ><T>{"Guide"}</T></a>
            {userId ? (
              <>
                <Link
                  className="inline-flex min-h-11 items-center px-1 py-2 transition-opacity hover:opacity-60"
                  href="/dashboard"
                ><T>{"Dashboard"}</T></Link>
                <span className="flex items-center">
                  <UserButton />
                </span>
              </>
            ) : (
              <>
                <Link
                  className="inline-flex min-h-11 items-center px-1 py-2 transition-opacity hover:opacity-60"
                  href="/login"
                ><T>{"Log in"}</T></Link>
                <Link
                  className="inline-flex min-h-11 items-center rounded-full bg-[#d7f16a] px-3.5 py-2.5 transition-transform hover:-translate-y-0.5 sm:px-4"
                  href="/signup"
                ><T>{"Get started"}</T></Link>
              </>
            )}
          </div>
        </nav>

        <div className="relative z-10 grid gap-10 pb-16 pt-12 sm:gap-12 sm:pb-24 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:pt-28">
          <div>
            <p className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#65736d] sm:mb-7 sm:text-xs sm:tracking-[0.2em]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#e57b4f]" />{" "}<T>{"Voice-first interview practice"}</T></p>
            <h1 className="max-w-4xl text-[2.75rem] font-semibold leading-[0.95] tracking-[-0.07em] sm:text-6xl sm:leading-[0.92] sm:tracking-[-0.075em] md:text-8xl"><T>{"Make your next answer your best one."}</T></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#52605a] sm:mt-8 sm:text-lg sm:leading-8"><T>{"A calm, realistic AI interview partner that knows your résumé, asks better questions, and helps you get sharper with every attempt."}</T></p>
            <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Link
                href={userId ? "/interview/new" : "/signup"}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#17201e] px-6 py-3.5 text-sm font-semibold text-[#f6f5f0] transition-transform hover:-translate-y-0.5"
              ><T>{"Start practicing"}</T><span className="ml-3">↗</span>
              </Link>
              <a
                href="#pricing"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#17201e]/20 px-6 py-3.5 text-sm font-semibold transition-colors hover:bg-white/60"
              ><T>{"From $3/week · free 24-hour trial"}</T></a>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#65736d] sm:text-sm">
              24 hours free · then $3/week · $9/month
              (one-time, stackable)
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-md px-1 lg:mb-2 lg:px-0">
            <div className="rounded-[1.5rem] border border-[#17201e]/10 bg-[#e3eee7] p-2.5 shadow-[0_24px_70px_-30px_rgba(23,32,30,0.35)] sm:rounded-[2rem] sm:p-3">
              <div className="rounded-[1.25rem] bg-[#17201e] p-5 text-[#f6f5f0] sm:rounded-[1.5rem] sm:p-8">
                <div className="flex items-center justify-between text-xs text-[#a9bbb2]">
                  <span><T>{"LIVE SESSION"}</T></span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#d7f16a]" />{" "}
                    00:14
                  </span>
                </div>
                <div className="mt-10 sm:mt-16">
                  <p className="text-sm text-[#a9bbb2]"><T>{"AI Interviewer"}</T></p>
                  <p className="mt-3 text-xl leading-snug tracking-[-0.04em] sm:text-2xl"><T>{"“Tell me about a project you’re proud of.”"}</T></p>
                </div>
                <div className="mt-12 flex items-center justify-between border-t border-white/10 pt-5 sm:mt-20">
                  <span className="text-xs text-[#a9bbb2]"><T>{"Listening..."}</T></span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-3 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-5 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-8 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-5 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-3 w-1 rounded-full bg-[#d7f16a]" />
                  </span>
                </div>
                <div className="mt-5">
                  <span className="inline-flex rounded-full bg-[#e57b4f] px-3 py-1.5 text-[11px] font-semibold text-white sm:px-4 sm:py-2 sm:text-xs"><T>{"tailored to you"}</T></span>
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
                <T>{feature.title}</T>
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#65736d]">
                <T>{feature.text}</T>
              </p>
            </article>
          ))}
        </div>

        <section
          id="guide"
          className="relative z-10 mt-10 border-t border-[#17201e]/10 pt-10 sm:mt-14 sm:pt-14"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e57b4f]"><T>{"How to use"}</T></p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-4xl"><T>{"From signup to sharper answers in four steps."}</T></h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {guideSteps.map((item) => (
              <li
                key={item.step}
                className="rounded-2xl border border-[#17201e]/10 bg-white/35 p-6"
              >
                <p className="text-xs font-semibold text-[#e57b4f]"><T>{"Step"}</T>{item.step}
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e57b4f]"><T>{"Pricing"}</T></p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-4xl"><T>{"24 hours free. Then simple one-time packs."}</T></h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#65736d] sm:text-base sm:leading-7"><T>{"New accounts get 24 hours of unlimited practice, starting with their first session. Packs are one-time (not subscriptions) and stack. Click a card to select it —"}</T>{" "}
            <strong className="font-semibold text-[#17201e]"><T>{"1 week / $3"}</T></strong>{" "}<T>{"is best value by default. Buy button sits inside each pack card."}</T></p>

          <PricingPackPicker
            signedIn={Boolean(userId)}
            trialHref="/interview/new"
            signupHref="/signup"
          />
          <p className="mt-4 text-xs leading-5 text-[#65736d]"><T>{"Prefer the full checkout page?"}</T>{" "}
            <Link href="/pricing" className="font-semibold underline underline-offset-4"><T>{"Open /pricing"}</T></Link><T>{". Refunds available within 24 hours of purchase."}</T></p>
        </section>

        <section
          id="languages"
          className="relative z-10 mt-10 border-t border-[#17201e]/10 pt-10 sm:mt-14 sm:pt-14"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e57b4f]"><T>{"Multilingual"}</T></p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-4xl"><T>{"Interview in the language your résumé speaks."}</T></h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#65736d] sm:text-base sm:leading-7"><T>{"Upload your résumé and we detect the language automatically — then questions, voice recognition, and coaching follow that language so practice feels natural from the first turn."}</T></p>
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
          <p><T>{"Your next interview starts with one good question."}</T></p>
          <nav className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium sm:gap-6">
            <a className="hover:opacity-70" href="#guide"><T>{"Guide"}</T></a>
            <a className="hover:opacity-70" href="#pricing"><T>{"Pricing"}</T></a>
            <Link className="hover:opacity-70" href="/terms"><T>{"Terms"}</T></Link>
            <Link className="hover:opacity-70" href="/privacy"><T>{"Privacy"}</T></Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
