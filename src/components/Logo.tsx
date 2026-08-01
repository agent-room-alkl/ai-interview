"use client";

/**
 * Canonical brand mark — landing-page scale on every surface.
 * `compact` only hides the tagline for dense headers; wordmark size does not shrink.
 * `showTagline` forces the tagline on (e.g. room header) even when compact.
 */
export function Logo({
  compact = false,
  showTagline = false,
}: {
  compact?: boolean;
  showTagline?: boolean;
}) {
  // Landing scale is the single source of truth (homepage / dashboard).
  const logoText = (
    <span
      className="inline-flex items-baseline whitespace-nowrap text-2xl font-semibold tracking-[-0.07em] sm:text-3xl"
      aria-label="Ainterv.com"
    >
      <span className="text-[#e57b4f]">A</span>
      <span className="relative inline-flex h-[1em] w-[0.22em] justify-center leading-none text-[#17201e]">
        ı
        <span
          aria-hidden="true"
          className="absolute left-[55%] top-[0.03em] h-[0.22em] w-[0.22em] -translate-x-1/2 rounded-full bg-[#d7f16a] ring-1 ring-[#17201e]/10"
        />
      </span>
      <span className="text-[#17201e]">nterv.com</span>
    </span>
  );

  const withTagline = showTagline || !compact;
  if (!withTagline) {
    return logoText;
  }

  return (
    <div className="flex flex-col items-start gap-0">
      {logoText}
      <span className="-mt-0.5 whitespace-nowrap text-[8px] font-semibold uppercase leading-none tracking-[0.02em] text-[#65736d]">
        Next answer your best one.
      </span>
    </div>
  );
}
