"use client";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline font-semibold tracking-[-0.07em] ${compact ? "text-base" : "text-xl"}`}
      aria-label="Ainterv"
    >
      <span className="text-[#e57b4f]">A</span>
      <span className="relative text-[#17201e]">
        i
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[-0.12em] h-[0.28em] w-[0.28em] -translate-x-1/2 rounded-full bg-[#d7f16a] ring-1 ring-[#17201e]/10"
        />
      </span>
      <span className="text-[#17201e]">nterv</span>
    </span>
  );
}
