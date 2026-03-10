import Tesseract from "tesseract.js";

export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const { data: { text } } = await Tesseract.recognize(buffer, "eng", {
    logger: () => {},
  });
  return text;
}
