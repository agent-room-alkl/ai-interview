// Server-only answer keys + grading. Do not import from client components.
import "server-only";
import type { WrittenAnswer } from "@/lib/written-questions";

type AnswerKey =
  | { kind: "coding"; contains?: string[]; exact?: string }
  | { kind: "single_choice"; optionId: string }
  | { kind: "multi_choice"; optionIds: string[] };

const ANSWER_KEYS: Record<string, AnswerKey> = {
  "wq-coding-fizz": {
    kind: "coding",
    contains: ["def", "fizz", "buzz", "%"],
  },
  "wq-single-gil": {
    kind: "single_choice",
    optionId: "b",
  },
  "wq-multi-complexity": {
    kind: "multi_choice",
    optionIds: ["a", "c"],
  },
  "wq-graphic-shape": {
    kind: "single_choice",
    optionId: "triangle",
  },
};

/** Grade against the hidden answer key (never shipped to the browser). */
export function gradeWrittenAnswer(
  questionId: string,
  answer: WrittenAnswer,
): { ok: boolean; detail: string } {
  const key = ANSWER_KEYS[questionId];
  if (!key) return { ok: true, detail: "No key — recorded." };

  if (key.kind === "coding" && answer.kind === "coding") {
    const lower = answer.code.toLowerCase();
    const missing = (key.contains ?? []).filter((s) => !lower.includes(s));
    if (key.exact && answer.code.trim() !== key.exact) {
      return { ok: false, detail: "Code does not match expected solution." };
    }
    if (missing.length) {
      return {
        ok: false,
        detail: `Expected concepts missing: ${missing.join(", ")}.`,
      };
    }
    return { ok: true, detail: "Looks like a solid FizzBuzz sketch." };
  }

  if (key.kind === "single_choice" && answer.kind === "single_choice") {
    const ok = answer.optionId === key.optionId;
    return {
      ok,
      detail: ok ? "Correct." : "Not quite — try another option.",
    };
  }

  if (key.kind === "multi_choice" && answer.kind === "multi_choice") {
    const a = [...answer.optionIds].sort().join(",");
    const b = [...key.optionIds].sort().join(",");
    const ok = a === b;
    return {
      ok,
      detail: ok ? "Correct." : "Selection incomplete or incorrect.",
    };
  }

  return { ok: false, detail: "Answer format mismatch." };
}
