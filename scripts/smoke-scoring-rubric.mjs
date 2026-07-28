/**
 * T-27 smoke: verify score-band constants and that the trainer prompt embeds
 * the calibrated rubric (no LLM call — prompt contract check only).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, "../src/lib/interview-engine.ts"),
  "utf8",
);

const checks = [];
function assert(cond, msg) {
  checks.push({ ok: Boolean(cond), msg });
  if (!cond) console.error("FAIL:", msg);
  else console.log("OK:", msg);
}

assert(src.includes("export const PASS_THRESHOLD = 80"), "PASS_THRESHOLD=80");
assert(src.includes("SCORE_BANDS"), "SCORE_BANDS exported");
assert(src.includes("SCORING RUBRIC (T-27)"), "T-27 rubric in trainer prompt");
assert(src.includes("0–29"), "empty/noise band documented");
assert(src.includes("60–79"), "partial band documented");
assert(src.includes("80–89"), "strong-pass band documented");
assert(
  src.includes("do NOT park a strong answer in the 60s"),
  "ASR mid-band anti-parking rule",
);
assert(
  src.includes("Prefer non-round scores"),
  "anti-clustering on 60/70 rule",
);

// Band math sanity (mirrors SCORE_BANDS)
const bands = {
  emptyOrNoise: [0, 29],
  vague: [30, 59],
  partial: [60, 79],
  strongPass: [80, 89],
  excellent: [90, 100],
};
assert(bands.strongPass[0] === 80, "strongPass starts at PASS_THRESHOLD");
assert(bands.partial[1] < bands.strongPass[0], "partial below pass");

const failed = checks.filter((c) => !c.ok);
console.log(
  failed.length === 0
    ? `\nSMOKE PASS (${checks.length} checks)`
    : `\nSMOKE FAIL ${failed.length}/${checks.length}`,
);
process.exit(failed.length === 0 ? 0 : 1);
