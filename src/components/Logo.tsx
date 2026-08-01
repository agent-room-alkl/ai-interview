"use client";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="ainterv">
      <svg
        aria-hidden="true"
        className="h-9 w-9 shrink-0"
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="44" height="44" rx="14" fill="#17201E" />
        <path
          d="M11 27.5c0-7.18 5.82-13 13-13h9v9c0 7.18-5.82 13-13 13h-3.5L11 40v-12.5Z"
          fill="#E3EEE7"
        />
        <path
          d="M15.5 29.5c2.6-.05 4.14-1.72 5.23-4.57 1.1-2.85 2.53-4.43 4.9-4.43 2.08 0 3.5 1.13 4.62 2.25"
          stroke="#D7F16A"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="32.5" cy="11.5" r="3.5" fill="#E57B4F" />
      </svg>
      {!compact ? <span className="text-lg font-semibold tracking-[-0.04em]">ainterv</span> : null}
    </span>
  );
}
