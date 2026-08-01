/**
 * Lightweight billing helper checks (no DB / Stripe).
 * Run: node scripts/check-billing.mjs
 */
import assert from "node:assert/strict";

function extendAccessUntil(current, days, now = new Date()) {
  if (!Number.isFinite(days) || days <= 0) throw new Error("days");
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

function hasActiveAccess(accessUntil, now = new Date()) {
  if (accessUntil == null) return false;
  const ms =
    typeof accessUntil === "string"
      ? Date.parse(accessUntil)
      : accessUntil.getTime();
  return Number.isFinite(ms) && ms > now.getTime();
}

function canStartSession({ accessUntil, trialUsed, durationMinutes, now }) {
  const allowed = [10, 20, 30];
  if (!allowed.includes(durationMinutes)) {
    return { ok: false, reason: "bad duration" };
  }
  if (hasActiveAccess(accessUntil, now)) return { ok: true, via: "paid" };
  if (!trialUsed && durationMinutes === 10) return { ok: true, via: "trial" };
  if (!trialUsed) return { ok: false, reason: "trial 10 only" };
  return { ok: false, reason: "need pay" };
}

const now = new Date("2026-08-01T12:00:00.000Z");

// Stack from now when expired/null
{
  const next = extendAccessUntil(null, 1, now);
  assert.equal(next.toISOString(), "2026-08-02T12:00:00.000Z");
}
{
  const expired = new Date("2026-07-01T00:00:00.000Z");
  const next = extendAccessUntil(expired, 7, now);
  assert.equal(next.toISOString(), "2026-08-08T12:00:00.000Z");
}
// Stack onto future access
{
  const future = new Date("2026-08-10T12:00:00.000Z");
  const next = extendAccessUntil(future, 30, now);
  assert.equal(next.toISOString(), "2026-09-09T12:00:00.000Z");
}

assert.equal(hasActiveAccess(null, now), false);
assert.equal(hasActiveAccess(new Date("2026-08-01T11:00:00.000Z"), now), false);
assert.equal(hasActiveAccess(new Date("2026-08-01T13:00:00.000Z"), now), true);

assert.deepEqual(
  canStartSession({ accessUntil: null, trialUsed: false, durationMinutes: 10, now }),
  { ok: true, via: "trial" },
);
assert.equal(
  canStartSession({ accessUntil: null, trialUsed: false, durationMinutes: 20, now }).ok,
  false,
);
assert.equal(
  canStartSession({ accessUntil: null, trialUsed: true, durationMinutes: 10, now }).ok,
  false,
);
assert.deepEqual(
  canStartSession({
    accessUntil: new Date("2026-08-02T00:00:00.000Z"),
    trialUsed: true,
    durationMinutes: 30,
    now,
  }),
  { ok: true, via: "paid" },
);

function canRequestRefund({ status, paidAt, now = new Date() }) {
  if (status !== "paid" || !paidAt) return { ok: false };
  const paidMs = typeof paidAt === "string" ? Date.parse(paidAt) : paidAt.getTime();
  if (now.getTime() - paidMs > 24 * 60 * 60 * 1000) return { ok: false };
  return { ok: true };
}

function shortenAccessUntil(current, days, now = new Date()) {
  if (current == null) return null;
  const currentMs = typeof current === "string" ? Date.parse(current) : current.getTime();
  const next = currentMs - days * 24 * 60 * 60 * 1000;
  if (next <= now.getTime()) return now;
  return new Date(next);
}

assert.equal(
  canRequestRefund({
    status: "paid",
    paidAt: new Date("2026-08-01T10:00:00.000Z"),
    now,
  }).ok,
  true,
);
assert.equal(
  canRequestRefund({
    status: "paid",
    paidAt: new Date("2026-07-30T10:00:00.000Z"),
    now,
  }).ok,
  false,
);
{
  const shortened = shortenAccessUntil(new Date("2026-08-10T12:00:00.000Z"), 1, now);
  assert.equal(shortened.toISOString(), "2026-08-09T12:00:00.000Z");
}

// Claim-once semantics (mirrors updateMany status filters in billing-fulfill)
function canClaimPaid(status) {
  return status === "pending" || status === "failed";
}
function canClaimRefund(status) {
  return status === "paid" || status === "refund_requested";
}
assert.equal(canClaimPaid("pending"), true);
assert.equal(canClaimPaid("paid"), false);
assert.equal(canClaimPaid("paid") || canClaimPaid("paid"), false);
// Second concurrent fulfill sees paid → no second extend
{
  let grants = 0;
  for (const status of ["pending", "paid"]) {
    if (canClaimPaid(status)) grants += 1;
  }
  assert.equal(grants, 1);
}
assert.equal(canClaimRefund("paid"), true);
assert.equal(canClaimRefund("refunded"), false);
{
  let refunds = 0;
  for (const status of ["paid", "refunded"]) {
    if (canClaimRefund(status)) refunds += 1;
  }
  assert.equal(refunds, 1);
}

console.log("all billing checks passed");
