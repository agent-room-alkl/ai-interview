/** Pure helpers for interview timeout / force-complete rules. */

export function isDeadlinePassed(
  deadlineAt: string | Date | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!deadlineAt) return false;
  const ms =
    typeof deadlineAt === "string" ? Date.parse(deadlineAt) : deadlineAt.getTime();
  if (!Number.isFinite(ms)) return false;
  return ms <= nowMs;
}

/** Seconds remaining until deadline (0 when expired). Null when no deadline. */
export function secondsRemaining(
  deadlineAt: string | Date | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!deadlineAt) return null;
  const ms =
    typeof deadlineAt === "string" ? Date.parse(deadlineAt) : deadlineAt.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil((ms - nowMs) / 1000));
}

/**
 * When the countdown hits zero the session must force-complete (both practice
 * soft timer and formal interview hard stop share deadlineAt).
 */
export function shouldForceCompleteOnZero(
  timeLeftSeconds: number | null,
  alreadyFinished: boolean,
): boolean {
  if (alreadyFinished) return false;
  if (timeLeftSeconds === null) return false;
  return timeLeftSeconds <= 0;
}
