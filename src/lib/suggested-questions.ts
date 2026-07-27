/** Role-aware suggested interview questions shown as tappable chips in the room. */

export type SuggestedQuestion = {
  id: string;
  label: string;
  question: string;
};

function isTech(role: string) {
  return /engineer|developer|software|frontend|backend|full.?stack|sre|devops|data|ml|machine learning|qa|test|security|platform|mobile|ios|android|infra/i.test(
    role,
  );
}

function isProduct(role: string) {
  return /product|pm\b|product manager/i.test(role);
}

function isDesign(role: string) {
  return /design|ux|ui|product designer/i.test(role);
}

function isSales(role: string) {
  return /sales|account executive|bd\b|business development|customer success/i.test(
    role,
  );
}

/** Return 5–7 concise spoken-friendly questions tailored to the target role. */
export function suggestedQuestionsForRole(targetRole: string): SuggestedQuestion[] {
  const role = targetRole.trim() || "this role";
  const common: SuggestedQuestion[] = [
    {
      id: "behavioral-challenge",
      label: "Tough challenge",
      question: `Tell me about a difficult challenge you faced that is relevant to ${role}, and how you handled it.`,
    },
    {
      id: "behavioral-conflict",
      label: "Team conflict",
      question:
        "Describe a time you disagreed with a teammate or stakeholder. How did you resolve it?",
    },
    {
      id: "motivation",
      label: "Why this role",
      question: `Why are you interested in the ${role} role, and what would success look like in your first 90 days?`,
    },
  ];

  if (isTech(role)) {
    return [
      {
        id: "testing",
        label: "Testing strategy",
        question:
          "How do you approach testing — unit, integration, and end-to-end — for a feature you own?",
      },
      {
        id: "debugging",
        label: "Debugging",
        question:
          "Walk me through how you debug a production issue under time pressure.",
      },
      {
        id: "system-design",
        label: "System design",
        question:
          "Design a simple system for this role’s domain. What are the main components and trade-offs?",
      },
      {
        id: "code-quality",
        label: "Code quality",
        question:
          "What practices do you use to keep codebases maintainable as they grow?",
      },
      ...common.slice(0, 2),
    ];
  }

  if (isProduct(role)) {
    return [
      {
        id: "prioritization",
        label: "Prioritization",
        question:
          "How do you prioritize a roadmap when engineering capacity is limited and stakeholders disagree?",
      },
      {
        id: "metrics",
        label: "Success metrics",
        question:
          "Tell me about a product you shipped. How did you define and measure success?",
      },
      {
        id: "discovery",
        label: "User discovery",
        question:
          "Describe how you validate a product idea before committing engineering resources.",
      },
      ...common,
    ];
  }

  if (isDesign(role)) {
    return [
      {
        id: "process",
        label: "Design process",
        question:
          "Walk me through your end-to-end design process for a complex product surface.",
      },
      {
        id: "critique",
        label: "Design critique",
        question:
          "Tell me about feedback that changed your design direction. What did you learn?",
      },
      {
        id: "accessibility",
        label: "Accessibility",
        question:
          "How do you incorporate accessibility and inclusive design into your work?",
      },
      ...common,
    ];
  }

  if (isSales(role)) {
    return [
      {
        id: "pipeline",
        label: "Pipeline",
        question:
          "How do you build and manage a healthy sales pipeline from prospecting to close?",
      },
      {
        id: "objection",
        label: "Objections",
        question:
          "Tell me about a time a deal stalled. How did you unblock it?",
      },
      {
        id: "discovery-call",
        label: "Discovery call",
        question:
          "What does a strong discovery call look like for you, and what questions do you always ask?",
      },
      ...common,
    ];
  }

  // Generic professional / industry fallback
  return [
    {
      id: "industry-trend",
      label: "Industry trends",
      question: `What industry trends matter most for ${role} right now, and how do you stay current?`,
    },
    {
      id: "stakeholder",
      label: "Stakeholders",
      question:
        "Describe how you communicate progress and risk to stakeholders who are not experts in your domain.",
    },
    {
      id: "craft",
      label: "Craft example",
      question: `Share a piece of work you’re proud of that shows you can excel as a ${role}.`,
    },
    ...common,
  ];
}
