import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

/**
 * Extract plain text from an uploaded résumé file (PDF or DOCX).
 * pdf-parse v2 uses the PDFParse class (not the v1 default function).
 */
export async function parseResumeFile(
  file: File,
): Promise<{ text: string; error?: string }> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const text = (result.text ?? "")
          .replace(/\n\s*--\s*\d+\s+of\s+\d+\s*--\s*\n/g, "\n")
          .trim();
        if (!text) {
          return { text: "", error: "Could not extract text from that PDF." };
        }
        return { text };
      } finally {
        await parser.destroy().catch(() => undefined);
      }
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

    return {
      text: "",
      error: "Unsupported file type. Upload a PDF or DOCX, or paste your résumé.",
    };
  } catch (err) {
    console.error("resume parse failed", err);
    return { text: "", error: "Failed to parse résumé file. Try paste instead." };
  }
}
