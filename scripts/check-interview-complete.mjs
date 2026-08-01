// Lightweight automated checks for timeout/force-complete helpers.
// Run: node scripts/check-interview-complete.mjs

function isDeadlinePassed(deadlineAt, nowMs = Date.now()) {
  if (!deadlineAt) return false;
  const ms = typeof deadlineAt === "string" ? Date.parse(deadlineAt) : deadlineAt.getTime();
  if (!Number.isFinite(ms)) return false;
  return ms <= nowMs;
}

function secondsRemaining(deadlineAt, nowMs = Date.now()) {
  if (!deadlineAt) return null;
  const ms = typeof deadlineAt === "string" ? Date.parse(deadlineAt) : deadlineAt.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil((ms - nowMs) / 1000));
}

function shouldForceCompleteOnZero(timeLeftSeconds, alreadyFinished) {
  if (alreadyFinished) return false;
  if (timeLeftSeconds === null) return false;
  return timeLeftSeconds <= 0;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  } else {
    console.log("OK", msg);
  }
}

const now = Date.parse("2026-08-01T12:00:00.000Z");
assert(isDeadlinePassed(null, now) === false, "no deadline → not passed");
assert(isDeadlinePassed("2026-08-01T11:59:00.000Z", now) === true, "past deadline passed");
assert(isDeadlinePassed("2026-08-01T12:01:00.000Z", now) === false, "future deadline not passed");
assert(secondsRemaining("2026-08-01T12:01:00.000Z", now) === 60, "60s remaining");
assert(secondsRemaining("2026-08-01T11:59:00.000Z", now) === 0, "expired → 0s");
assert(shouldForceCompleteOnZero(0, false) === true, "zero forces complete");
assert(shouldForceCompleteOnZero(0, true) === false, "already finished skips");
assert(shouldForceCompleteOnZero(null, false) === false, "no timer skips");
assert(shouldForceCompleteOnZero(12, false) === false, "positive remaining continues");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall interview-complete checks passed");
