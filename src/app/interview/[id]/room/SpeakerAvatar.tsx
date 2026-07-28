"use client";

export type SpeakerRole = "interviewer" | "trainer" | "user";

const ROLE_STYLES: Record<
  SpeakerRole,
  { bg: string; fg: string; label: string }
> = {
  interviewer: {
    bg: "bg-[#17201e]",
    fg: "text-[#d7f16a]",
    label: "AI",
  },
  trainer: {
    bg: "bg-amber-500",
    fg: "text-white",
    label: "TR",
  },
  user: {
    bg: "bg-indigo-600",
    fg: "text-white",
    label: "U",
  },
};

function initialsFrom(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function SpeakerAvatar({
  role,
  name,
  imageUrl,
  speaking = false,
  size = 36,
}: {
  role: SpeakerRole;
  name?: string | null;
  imageUrl?: string | null;
  speaking?: boolean;
  size?: number;
}) {
  const style = ROLE_STYLES[role];
  const initials =
    role === "user"
      ? initialsFrom(name)
      : role === "interviewer"
        ? "AI"
        : "TR";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${style.label} avatar`}
    >
      {role === "user" && imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          className="h-full w-full rounded-full object-cover ring-2 ring-white"
        />
      ) : (
        <div
          className={`grid h-full w-full place-items-center rounded-full text-[11px] font-semibold ring-2 ring-white ${style.bg} ${style.fg}`}
        >
          {initials}
        </div>
      )}
      {speaking ? (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
      ) : null}
    </div>
  );
}
