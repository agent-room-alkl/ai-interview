/** Practice access packs + free-trial rules. */

export type PackId = "day" | "week" | "month";

export type AccessPack = {
  id: PackId;
  name: string;
  days: number;
  amountCents: number;
  blurb: string;
  /** Short feature bullets shown on pricing cards. */
  features: string[];
};

/** Default / most popular pack on marketing + /pricing. */
export const FEATURED_PACK_ID: PackId = "week";

export const PACK_FEATURE_CORE = [
  "Unlimited 10 / 20 / 30 min sessions while active",
  "AI interviewer with natural voice",
  "AI practice coach (trainer mode)",
  "Résumé-aware questions & scoring",
] as const;

export const ACCESS_PACKS: Record<PackId, AccessPack> = {
  day: {
    id: "day",
    name: "1 day",
    days: 1,
    amountCents: 300,
    blurb: "Sprint day — unlimited practice for 24 hours.",
    features: [
      ...PACK_FEATURE_CORE,
      "Stack more days anytime",
    ],
  },
  week: {
    id: "week",
    name: "1 week",
    days: 7,
    amountCents: 900,
    blurb: "Most popular — a full week of focused prep.",
    features: [
      ...PACK_FEATURE_CORE,
      "Best balance of time and price",
      "Stack another week when you need it",
    ],
  },
  month: {
    id: "month",
    name: "1 month",
    days: 30,
    amountCents: 1900,
    blurb: "Long runway — a full month of unlimited sessions.",
    features: [
      ...PACK_FEATURE_CORE,
      "Lowest cost per day",
      "Stack packs for longer campaigns",
    ],
  },
};

export const PACK_IDS = Object.keys(ACCESS_PACKS) as PackId[];

export const TRIAL_DURATION_MINUTES = 10;
export const PAID_DURATIONS = [10, 20, 30] as const;
export type SessionDuration = (typeof PAID_DURATIONS)[number];

export function isPackId(value: string): value is PackId {
  return value === "day" || value === "week" || value === "month";
}

export function getPack(id: PackId): AccessPack {
  return ACCESS_PACKS[id];
}

/** Stack pack days onto existing access (or now if expired/null). */
export function extendAccessUntil(
  current: Date | string | null | undefined,
  days: number,
  now: Date = new Date(),
): Date {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("days must be a positive number");
  }
  const currentMs =
    current == null
      ? NaN
      : typeof current === "string"
        ? Date.parse(current)
        : current.getTime();
  const baseMs =
    Number.isFinite(currentMs) && currentMs > now.getTime()
      ? currentMs
      : now.getTime();
  return new Date(baseMs + days * 24 * 60 * 60 * 1000);
}

export function hasActiveAccess(
  accessUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (accessUntil == null) return false;
  const ms =
    typeof accessUntil === "string"
      ? Date.parse(accessUntil)
      : accessUntil.getTime();
  return Number.isFinite(ms) && ms > now.getTime();
}

/**
 * Who may start a session of `durationMinutes`.
 * - Paid access: 10 / 20 / 30
 * - Free trial (once): 10 only, while trialUsed is false
 */
export function canStartSession(opts: {
  accessUntil: Date | string | null | undefined;
  trialUsed: boolean;
  durationMinutes: number;
  now?: Date;
}): { ok: true; via: "paid" | "trial" } | { ok: false; reason: string } {
  const duration = opts.durationMinutes;
  if (!(PAID_DURATIONS as readonly number[]).includes(duration)) {
    return { ok: false, reason: "Choose 10, 20, or 30 minutes." };
  }
  if (hasActiveAccess(opts.accessUntil, opts.now)) {
    return { ok: true, via: "paid" };
  }
  if (!opts.trialUsed && duration === TRIAL_DURATION_MINUTES) {
    return { ok: true, via: "trial" };
  }
  if (!opts.trialUsed && duration !== TRIAL_DURATION_MINUTES) {
    return {
      ok: false,
      reason:
        "Your free trial is limited to a 10-minute session. Buy access to unlock 20 and 30 minutes.",
    };
  }
  return {
    ok: false,
    reason: "Your free trial is used up. Buy a practice pack to continue.",
  };
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Refunds may be requested within 24 hours of payment. */
export const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canRequestRefund(opts: {
  status: string;
  paidAt: Date | string | null | undefined;
  now?: Date;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.status !== "paid") {
    return { ok: false, reason: "Only completed purchases can be refunded." };
  }
  if (!opts.paidAt) {
    return { ok: false, reason: "Missing payment time." };
  }
  const paidMs =
    typeof opts.paidAt === "string"
      ? Date.parse(opts.paidAt)
      : opts.paidAt.getTime();
  if (!Number.isFinite(paidMs)) {
    return { ok: false, reason: "Invalid payment time." };
  }
  const now = opts.now ?? new Date();
  if (now.getTime() - paidMs > REFUND_WINDOW_MS) {
    return {
      ok: false,
      reason: "Refund window is 24 hours after purchase.",
    };
  }
  return { ok: true };
}

/** After a refund, pull accessUntil back by the pack days (floor at now). */
export function shortenAccessUntil(
  current: Date | string | null | undefined,
  days: number,
  now: Date = new Date(),
): Date | null {
  if (current == null) return null;
  if (!Number.isFinite(days) || days <= 0) return typeof current === "string" ? new Date(current) : current;
  const currentMs =
    typeof current === "string" ? Date.parse(current) : current.getTime();
  if (!Number.isFinite(currentMs)) return null;
  const next = currentMs - days * 24 * 60 * 60 * 1000;
  if (next <= now.getTime()) return now;
  return new Date(next);
}
