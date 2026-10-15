import Link from "next/link";
import { T } from "@/components/LanguageProvider";

export function PitchPracticeEntry() {
  return (
    <section className="mt-6 flex flex-col gap-5 rounded-3xl border border-[#17201e]/15 bg-[#e3eee7] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#52605a]">
          <T>{"Quick practice · 30 or 60 seconds"}</T>
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17201e]">
          <T>{"Elevator speech practice"}</T>
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#52605a]">
          <T>{"Practice a short self-introduction and get a recommended template based on your words and résumé background."}</T>
        </p>
      </div>
      <Link
        href="/interview/pitch"
        className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-[#17201e] px-6 py-3 text-sm font-semibold text-white hover:bg-[#2d3c36] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#17201e]"
      >
        <T>{"Start elevator speech →"}</T>
      </Link>
    </section>
  );
}
