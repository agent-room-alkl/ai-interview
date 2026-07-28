"use client";

/** Compact bouncing-bar waveform for the active speaker. */
export function SpeakingIndicator({
  active,
  tone = "neutral",
}: {
  active: boolean;
  tone?: "user" | "ai" | "neutral";
}) {
  if (!active) return null;

  const bar =
    tone === "user"
      ? "bg-indigo-300"
      : tone === "ai"
        ? "bg-emerald-400"
        : "bg-gray-400";

  return (
    <span
      className="inline-flex h-4 items-end gap-0.5"
      aria-label="Speaking"
      role="status"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`inline-block w-0.5 rounded-full ${bar}`}
          style={{
            height: 14,
            transformOrigin: "bottom",
            animation: `room-speak-wave 0.7s ease-in-out ${i * 0.12}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
