import mammoth from "mammoth";

export const MAX_RESUME_CONTEXT_CHARS = 6000;

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>|<\/div\s*>|<\/li\s*>|<\/h[1-6]\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function redactPrivateData(value: string): string {
  return value
    // Email addresses.
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    // International and common local phone formats.
    .replace(/(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)/g, "")
    // Labeled contact/address lines, without removing a person's name.
    .replace(/^\s*(?:phone|mobile|tel|telephone|email|e-mail|address|地址|电话|手机|邮箱)\s*[:：].*$/gim, "")
    // Street-address-shaped lines (number + street suffix).
    .replace(/^\s*\d{1,5}\s+[^\n]{1,80}\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?)\b[^\n]*$/gim, "");
}

const RESUME_SECTIONS: Array<{ title: string; pattern: RegExp }> = [
  { title: "Personal profile", pattern: /^(?:personal profile|profile|summary|professional summary|about me|objective|个人信息|个人简介|简介|概述)\s*:?$/i },
  { title: "Education", pattern: /^(?:education|academic background|qualifications|学历|教育经历|教育背景)\s*:?$/i },
  { title: "Work experience", pattern: /^(?:work experience|professional experience|employment history|experience|工作经验|工作经历|任职经历)\s*:?$/i },
  { title: "Skills", pattern: /^(?:skills|technical skills|core skills|technologies|competencies|技能|专业技能|技术栈)\s*:?$/i },
  { title: "Languages", pattern: /^(?:languages|language skills|语言|语言能力)\s*:?$/i },
  { title: "Projects", pattern: /^(?:projects|selected projects|项目|项目经历)\s*:?$/i },
  { title: "Certifications", pattern: /^(?:certifications|certificates|证书|认证)\s*:?$/i },
  { title: "Achievements", pattern: /^(?:achievements|awards|荣誉|成就)\s*:?$/i },
];

function sectionTitle(line: string): string | null {
  return RESUME_SECTIONS.find((section) => section.pattern.test(line))?.title ?? null;
}

/**
 * Turn uploaded/pasted résumé text into the small, editable context used by
 * role matching and both interview agents. This is intentionally deterministic
 * so private contact details never need to reach an AI model first.
 */
export function standardizeResumeText(input: string): string {
  const redacted = redactPrivateData(stripHtml(input));
  const lines = redacted
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^[•·▪◦]\s*/, "- ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  // Collapse repeated lines and excessive blank structure while preserving
  // section headings and useful bullet points for the user to review.
  const unique = lines.filter((line, index) => lines.indexOf(line) === index);
  const sections: string[] = ["# Resume background"];
  let activeSection = "Personal profile";
  sections.push(`## ${activeSection}`);
  for (const line of unique) {
    const heading = sectionTitle(line);
    if (heading) {
      if (heading !== activeSection) {
        activeSection = heading;
        sections.push(`\n## ${activeSection}`);
      }
      continue;
    }
    const content = /^[-*•]\s+/.test(line) ? line.replace(/^[*•]\s+/, "- ") : line;
    sections.push(content);
  }
  const compact = sections.join("\n").slice(0, MAX_RESUME_CONTEXT_CHARS).trim();
  return compact;
}

/**
 * Extract plain text from an uploaded résumé file (PDF or DOCX).
 *
 * PDF uses `unpdf` — a serverless-optimized pdfjs build that needs no canvas /
 * DOMMatrix, so it works on Vercel Node functions (pdf-parse v2's pdfjs crashed
 * there with "DOMMatrix is not defined"). Loaded dynamically so page render
 * doesn't pull it in. DOCX uses mammoth. Callers can always paste text instead.
 */
export async function parseResumeFile(
  file: File,
): Promise<{ text: string; error?: string }> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const clean = (Array.isArray(text) ? text.join("\n") : (text ?? "")).trim();
      if (!clean) {
        return { text: "", error: "Could not extract text from that PDF." };
      }
      return { text: clean };
    }

    if (
      name.endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value ?? "").trim();
      if (!text) {
        return { text: "", error: "Could not extract text from that DOCX." };
      }
      return { text };
    }

    if (name.endsWith(".html") || name.endsWith(".htm") || file.type === "text/html") {
      const text = stripHtml(buffer.toString("utf8")).trim();
      if (!text) return { text: "", error: "Could not extract text from that HTML file." };
      return { text };
    }

    if (name.endsWith(".txt") || file.type === "text/plain") {
      const text = buffer.toString("utf8").trim();
      if (!text) return { text: "", error: "Could not extract text from that text file." };
      return { text };
    }

    return {
      text: "",
      error: "Unsupported file type. Upload a PDF, HTML, DOCX, or TXT file, or paste your résumé.",
    };
  } catch (err) {
    console.error("resume parse failed", err);
    return { text: "", error: "Failed to parse résumé file. Try paste instead." };
  }
}
