import { PDFDocument } from 'pdf-lib'

// Removes the first page (the "cover page") from a PDF byte stream.
// No-ops on single-page docs so a template without a cover page can't
// accidentally be reduced to zero pages. Report API routes call this
// when the client passes includeCover: false — default behavior
// (includeCover undefined/true) returns the bytes unchanged.
export async function stripCoverPage(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  if (doc.getPageCount() > 1) doc.removePage(0)
  return doc.save()
}
