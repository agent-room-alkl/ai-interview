"use client";

/** Compact bouncing-bar waveform for the active speaker. */
export function SpeakingIndicator({
  active,
  tone = "neutral",
}: {
  active: boolean;
  tone?: "interviewer" | "trainer" | "user" | "ai" | "neutral";
}) {
  if (!active) return null;

  const bar =
    tone === "interviewer" || tone === "ai"
      ? "bg-indigo-500"
      : tone === "trainer"
        ? "bg-amber-500"
        : tone === "user"
          ? "bg-emerald-500"
          : "bg-gray-400";

  return (
    <span
      className="inline-flex h-4 items-end gap-0.5"
      aria-label="Speaking"
      role="status"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`inline-block w-[3px] rounded-full ${bar}`}
          style={{
            height: 16,
            transformOrigin: "bottom",
            animation: `room-speak-wave 0.7s ease-in-out ${i * 0.1}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
