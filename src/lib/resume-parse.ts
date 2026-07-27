import mammoth from "mammoth";

/**
 * pdfjs-dist (via pdf-parse v2) expects a few browser globals even for text
 * extraction. Vercel Node functions don't provide them → DOMMatrix ReferenceError.
 */
function ensurePdfDomPolyfills() {
  const g = globalThis as typeof globalThis & {
    DOMMatrix?: unknown;
    ImageData?: unknown;
    Path2D?: unknown;
  };

  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {
      // Minimal stub — text extraction does not use matrix math.
      constructor(_init?: string | number[]) {}
    };
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(
        sw: number | Uint8ClampedArray,
        sh?: number,
        settings?: { width: number; height: number },
      ) {
        if (typeof sw === "number") {
          this.width = sw;
          this.height = sh ?? 0;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = sw;
          this.width = settings?.width ?? sh ?? 0;
          this.height = settings?.height ?? 0;
        }
      }
    };
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {};
  }
}

/**
 * Extract plain text from an uploaded résumé file (PDF or DOCX).
 * pdf-parse is loaded dynamically so page load does not pull pdfjs.
 */
export async function parseResumeFile(
  file: File,
): Promise<{ text: string; error?: string }> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      ensurePdfDomPolyfills();
      const { PDFParse } = await import("pdf-parse");
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
