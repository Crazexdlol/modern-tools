import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import Tesseract from "tesseract.js";

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8);
  const { text } = await extractText(pdf, { mergePages: true });

  // If the PDF has meaningful text content, return it
  const stripped = text.replace(/\s/g, "");
  if (stripped.length > 50) {
    return text;
  }

  // Otherwise this is likely a scanned/photo-based PDF — use OCR
  const totalPages = pdf.numPages;
  const pagesToProcess = Math.min(totalPages, 10);
  const ocrResults: string[] = [];

  for (let i = 1; i <= pagesToProcess; i++) {
    const imageArrayBuffer = await renderPageAsImage(pdf, i, { scale: 2 });
    const imageBuffer = Buffer.from(imageArrayBuffer);
    // Per-page timeout: 30 seconds. Tesseract can hang on pathological
    // images; we'd rather skip the page than block the whole request.
    try {
      const result = await Promise.race([
        Tesseract.recognize(imageBuffer, "eng", { logger: () => {} }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tesseract timeout")), 30_000)
        ),
      ]);
      ocrResults.push(result.data.text);
    } catch (err) {
      console.warn(`[pdf-extractor] page ${i} OCR skipped:`, err instanceof Error ? err.message : err);
    }
  }

  return ocrResults.join("\n\n");
}
