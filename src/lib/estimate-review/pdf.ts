"use client";
// Client-side helper: capture a rendered Estimate Review card as a paginated
// Letter-size PDF blob (auto-filed into the claim's Documents tab).
// Slicing/pagination pattern matches src/lib/summary-pdf.ts.
// Uses html2canvas-pro (drop-in fork) — the original html2canvas doesn't
// understand modern CSS color functions (oklch, lab) that Tailwind v4 generates.
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

export async function captureReviewPdf(el: HTMLElement): Promise<Blob | null> {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    windowWidth: 816, // 8.5in at 96dpi
    useCORS: true,
    logging: false,
  });

  const pageWidthPt = 612; // Letter, points
  const pageHeightPt = 792;
  const pxPerPt = canvas.width / pageWidthPt;
  const pageHeightPx = Math.floor(pageHeightPt * pxPerPt);

  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  let offset = 0;
  let first = true;
  while (offset < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    const img = slice.toDataURL("image/jpeg", 0.92);
    if (!first) pdf.addPage();
    pdf.addImage(img, "JPEG", 0, 0, pageWidthPt, sliceHeight / pxPerPt);
    first = false;
    offset += sliceHeight;
  }

  return pdf.output("blob");
}

export function reviewPdfFileName(reviewNumber: number, sourceFileName: string): string {
  const stem = sourceFileName.replace(/\.[^.]+$/, "");
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `Review #${reviewNumber} — ${stem} — ${dateStamp}.pdf`;
}
