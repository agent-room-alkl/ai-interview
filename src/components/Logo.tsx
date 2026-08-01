"use client";

export function Logo({
  compact = false,
  showTagline = false,
}: {
  compact?: boolean;
  showTagline?: boolean;
}) {
  const logoText = (
    <span
      className={`inline-flex items-baseline font-semibold tracking-[-0.07em] ${
        compact ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"
      }`}
      aria-label="Ainterv.com"
    >
      <span className="text-[#e57b4f]">A</span>
      <span className="relative inline-flex w-[0.22em] h-[1em] leading-none justify-center text-[#17201e]">
        ı
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[0.11em] h-[0.22em] w-[0.22em] -translate-x-1/2 rounded-full bg-[#d7f16a] ring-1 ring-[#17201e]/10"
        />
      </span>
      <span className="text-[#17201e]">nterv.com</span>
    </span>
  );

  if (compact && !showTagline) {
    return logoText;
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      {logoText}
      <span className="text-[9px] font-semibold tracking-[0.03em] uppercase text-[#65736d] sm:text-[10px]">
        Answer your best one.
      </span>
    </div>
  );
}
