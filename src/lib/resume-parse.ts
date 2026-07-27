import mammoth from "mammoth";

/**
 * Extract plain text from an uploaded résumé file (PDF or DOCX).
 */
export async function parseResumeFile(
  file: File,
): Promise<{ text: string; error?: string }> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const mod = await import("pdf-parse");
      const pdfParse = (mod as unknown as {
        default?: (data: Buffer) => Promise<{ text: string }>;
      }).default ?? (mod as unknown as (data: Buffer) => Promise<{ text: string }>);
      const result = await pdfParse(buffer);
      const text = (result.text ?? "").trim();
      if (!text) return { text: "", error: "Could not extract text from that PDF." };
      return { text };
    }

    if (
      name.endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value ?? "").trim();
      if (!text) return { text: "", error: "Could not extract text from that DOCX." };
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
