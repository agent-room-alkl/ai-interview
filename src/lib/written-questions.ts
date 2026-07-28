// Public written-question protocol — safe for client bundles (no answer keys).

export type WrittenQuestionKind =
  | "coding"
  | "single_choice"
  | "multi_choice";

export type ChoiceOption = {
  id: string;
  label: string;
  /** Optional image URL for graphic multiple-choice options. */
  imageUrl?: string;
};

/** Public question payload — safe to send to the client (no answers). */
export type WrittenQuestion = {
  id: string;
  kind: WrittenQuestionKind;
  prompt: string;
  language?: string;
  starterCode?: string;
  options?: ChoiceOption[];
};

export type WrittenAnswer =
  | { kind: "coding"; code: string }
  | { kind: "single_choice"; optionId: string }
  | { kind: "multi_choice"; optionIds: string[] }
  | { kind: "text"; text: string };

/** Demo bank — three kinds + one graphic single-choice. */
export const SAMPLE_WRITTEN_QUESTIONS: WrittenQuestion[] = [
  {
    id: "wq-coding-fizz",
    kind: "coding",
    language: "python",
    prompt:
      "Write a Python function `fizzbuzz(n)` that returns \"Fizz\" if n is divisible by 3, \"Buzz\" if by 5, \"FizzBuzz\" if by both, otherwise the number as a string.",
    starterCode: "def fizzbuzz(n):\n    # your code here\n    pass\n",
  },
  {
    id: "wq-single-gil",
    kind: "single_choice",
    prompt: "What does Python’s GIL primarily prevent?",
    options: [
      { id: "a", label: "Deadlocks in asyncio event loops" },
      { id: "b", label: "True parallel execution of bytecode in one process" },
      { id: "c", label: "Garbage collection of circular references" },
      { id: "d", label: "Importing C extensions" },
    ],
  },
  {
    id: "wq-multi-complexity",
    kind: "multi_choice",
    prompt: "Which of the following are O(1) average-case operations on a hash map? (select all)",
    options: [
      { id: "a", label: "Lookup by key" },
      { id: "b", label: "Sorting all keys" },
      { id: "c", label: "Insert / update by key" },
      { id: "d", label: "Finding the median key" },
    ],
  },
  {
    id: "wq-graphic-shape",
    kind: "single_choice",
    prompt: "Which diagram best represents a binary tree with 3 nodes (root + 2 children)?",
    options: [
      {
        id: "list",
        label: "Linear list",
        imageUrl:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="64"><rect width="120" height="64" fill="#f3f4f6"/><rect x="8" y="24" width="28" height="16" rx="3" fill="#6366f1"/><rect x="46" y="24" width="28" height="16" rx="3" fill="#6366f1"/><rect x="84" y="24" width="28" height="16" rx="3" fill="#6366f1"/></svg>`,
          ),
      },
      {
        id: "triangle",
        label: "Root with two children",
        imageUrl:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="64"><rect width="120" height="64" fill="#f3f4f6"/><circle cx="60" cy="16" r="10" fill="#6366f1"/><circle cx="30" cy="48" r="10" fill="#6366f1"/><circle cx="90" cy="48" r="10" fill="#6366f1"/><line x1="54" y1="24" x2="36" y2="40" stroke="#6366f1" stroke-width="2"/><line x1="66" y1="24" x2="84" y2="40" stroke="#6366f1" stroke-width="2"/></svg>`,
          ),
      },
      {
        id: "cycle",
        label: "Cycle of three",
        imageUrl:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="64"><rect width="120" height="64" fill="#f3f4f6"/><circle cx="40" cy="32" r="10" fill="#6366f1"/><circle cx="80" cy="16" r="10" fill="#6366f1"/><circle cx="80" cy="48" r="10" fill="#6366f1"/><line x1="48" y1="26" x2="70" y2="18" stroke="#6366f1" stroke-width="2"/><line x1="48" y1="38" x2="70" y2="46" stroke="#6366f1" stroke-width="2"/><line x1="80" y1="26" x2="80" y2="38" stroke="#6366f1" stroke-width="2"/></svg>`,
          ),
      },
    ],
  },
];

/** Format a written answer into the shared text utterance pipeline. */
export function formatWrittenAnswer(
  q: WrittenQuestion,
  answer: WrittenAnswer,
): string {
  if (answer.kind === "text") return answer.text.trim();
  if (answer.kind === "coding") {
    return `[Written coding answer — ${q.language ?? "code"}]\n${answer.code.trim()}`;
  }
  if (answer.kind === "single_choice") {
    const opt = q.options?.find((o) => o.id === answer.optionId);
    return `[Written choice] ${opt?.label ?? answer.optionId}`;
  }
  const labels = answer.optionIds.map(
    (id) => q.options?.find((o) => o.id === id)?.label ?? id,
  );
  return `[Written multi-choice] ${labels.join("; ")}`;
}
