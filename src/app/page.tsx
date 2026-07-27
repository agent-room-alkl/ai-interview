import Link from "next/link";

const features = [
  {
    number: "01",
    title: "Resume-aware sessions",
    text: "Upload your resume and get a focused interview plan built around your experience and target role.",
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

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f5f0] text-[#17201e]">
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-6 sm:px-10 lg:px-16">
        <div className="pointer-events-none absolute -right-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#d9f0e7] blur-3xl" />
        <nav className="relative z-10 flex items-center justify-between border-b border-[#17201e]/10 pb-5">
          <Link
            href="/"
            className="flex items-center gap-3 font-semibold tracking-[-0.03em]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#17201e] text-sm text-[#f6f5f0]">
              ai
            </span>
            <span className="text-lg">interview</span>
          </Link>
          <div className="flex items-center gap-5 text-sm font-medium">
            <a
              className="hidden transition-opacity hover:opacity-60 sm:inline"
              href="#how-it-works"
            >
              How it works
            </a>
            <Link className="transition-opacity hover:opacity-60" href="/login">
              Log in
            </Link>
            <Link
              className="rounded-full bg-[#d7f16a] px-4 py-2.5 transition-transform hover:-translate-y-0.5"
              href="/signup"
            >
              Get started
            </Link>
          </div>
        </nav>

        <div className="relative z-10 grid gap-12 pb-24 pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:pt-28">
          <div>
            <p className="mb-7 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#65736d]">
              <span className="h-2 w-2 rounded-full bg-[#e57b4f]" /> Voice-first
              interview practice
            </p>
            <h1 className="max-w-4xl text-6xl font-semibold leading-[0.92] tracking-[-0.075em] sm:text-8xl">
              Make your next answer your best one.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-[#52605a]">
              A calm, realistic AI interview partner that knows your resume,
              asks better questions, and helps you get sharper with every
              attempt.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="rounded-full bg-[#17201e] px-6 py-3.5 text-sm font-semibold text-[#f6f5f0] transition-transform hover:-translate-y-0.5"
              >
                Start practicing <span className="ml-3">↗</span>
              </Link>
              <a
                href="#how-it-works"
                className="rounded-full border border-[#17201e]/20 px-6 py-3.5 text-sm font-semibold transition-colors hover:bg-white/60"
              >
                See how it works
              </a>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:mb-2">
            <div className="rounded-[2rem] border border-[#17201e]/10 bg-[#e3eee7] p-3 shadow-[0_24px_70px_-30px_rgba(23,32,30,0.35)]">
              <div className="rounded-[1.5rem] bg-[#17201e] p-6 text-[#f6f5f0] sm:p-8">
                <div className="flex items-center justify-between text-xs text-[#a9bbb2]">
                  <span>LIVE SESSION</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#d7f16a]" />{" "}
                    00:14
                  </span>
                </div>
                <div className="mt-16">
                  <p className="text-sm text-[#a9bbb2]">AI Interviewer</p>
                  <p className="mt-3 text-2xl leading-snug tracking-[-0.04em]">
                    “Tell me about a project you’re proud of.”
                  </p>
                </div>
                <div className="mt-20 flex items-center justify-between border-t border-white/10 pt-5">
                  <span className="text-xs text-[#a9bbb2]">Listening...</span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-3 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-5 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-8 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-5 w-1 rounded-full bg-[#d7f16a]" />
                    <i className="h-3 w-1 rounded-full bg-[#d7f16a]" />
                  </span>
                </div>
              </div>
            </div>
            <span className="absolute -bottom-5 -left-6 rounded-full bg-[#e57b4f] px-4 py-2 text-xs font-semibold text-white shadow-lg sm:-left-10">
              tailored to you
            </span>
          </div>
        </div>

        <div
          id="how-it-works"
          className="relative z-10 grid gap-4 border-t border-[#17201e]/10 pt-8 md:grid-cols-3"
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
      </section>
      <footer className="border-t border-[#17201e]/10 px-6 py-6 text-center text-xs text-[#65736d] sm:px-10 lg:px-16">
        Your next interview starts with one good question.
      </footer>
    </main>
  );
}
