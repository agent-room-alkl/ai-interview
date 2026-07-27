import mammoth from "mammoth";

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

    return {
      text: "",
      error: "Unsupported file type. Upload a PDF or DOCX, or paste your résumé.",
    };
  } catch (err) {
    console.error("resume parse failed", err);
    return { text: "", error: "Failed to parse résumé file. Try paste instead." };
  }
}
