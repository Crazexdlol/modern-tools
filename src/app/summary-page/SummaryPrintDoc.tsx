"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "isomorphic-dompurify";
import { SavedSummary } from "./lib";

/**
 * Print-only rendering of a single summary. Hidden on screen; on print it
 * becomes the entire page. Mirrors the Modern Appraiser Summary Page.docx.
 * Uses a <thead> so the Modern Appraisers + ONE-STOP-SHOP header repeats on
 * every printed page.
 *
 * The document is portaled to <body> and, on print, every other direct child
 * of <body> is hidden. That lets it print identically whether it's dropped
 * into the standalone editor (`/summary-page/[id]`) or nested deep inside the
 * ACV comp-finder wizard — no page-specific "no-print" tagging required.
 */
export function SummaryPrintDoc({ summary }: { summary: SavedSummary }) {
  // One-time client mount guard: createPortal needs document.body, which is
  // absent during SSR.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const doc = (
    <div className="summary-print-portal">
      <table className="print-doc" aria-hidden="true">
        <thead className="print-repeated-header">
          <tr>
            <td>
              <div className="print-header-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.jpg"
                  alt="Modern Appraisers"
                  className="print-logo"
                />
                <div className="print-tagline">
                  ONE-STOP-SHOP<br />
                  FOR YOUR APPRAISAL NEEDS
                </div>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <h1 className="print-title">Summary Page</h1>

              <div className="print-fields">
                <PrintField label="Date" value={formatDateUS(summary.date)} />
                <PrintField label="Claim Number" value={summary.claimNumber} />
                <PrintField label="Insurance Company" value={summary.insuranceCompany} />
                <PrintField label="Vehicle Owner" value={summary.vehicleOwner} />
                <PrintField label="Vehicle" value={summary.vehicle} />
                <PrintField label="Date of Loss" value={formatDateUS(summary.dateOfLoss)} />
              </div>

              <hr className="print-divider" />

              <div className="print-fields">
                <PrintField label="Opposing Appraiser" value={opposingAppraiserLine(summary)} />
                <PrintField label="Date Received Claim" value={formatDateUS(summary.dateReceivedClaim)} />
                <PrintField
                  label="Initial Contact"
                  value={
                    summary.initialContactDate
                      ? `${formatDateUS(summary.initialContactDate)}${summary.initialContactVia ? ` via ${summary.initialContactVia}` : ""}`
                      : ""
                  }
                />
              </div>

              {summary.statuses.some((s) => s.date || s.text) && (
                <div className="print-status-block">
                  {summary.statuses
                    .filter((s) => s.date || s.text)
                    .map((s) => (
                      <div key={s.id} className="print-status">
                        <span className="print-label">Status:</span>{" "}
                        {formatDateUS(s.date)}
                        {s.date && s.text ? " " : ""}
                        {s.text}
                      </div>
                    ))}
                </div>
              )}

              {summary.additionalInfo.some((i) => i.text.trim()) && (
                <div className="print-section print-new-page">
                  <h2 className="print-section-title">Additional Claim Information</h2>
                  <ul className="print-bullets">
                    {summary.additionalInfo
                      .filter((i) => i.text.trim())
                      .map((i) => (
                        <li key={i.id}>{i.text}</li>
                      ))}
                  </ul>
                </div>
              )}

              {summary.stateLaws
                .filter((l) => l.state || l.content)
                .map((law) => (
                  <div key={law.id}>
                    <hr className="print-divider" />
                    <div className="print-section print-state-law">
                      <h2 className="print-section-title">
                        State Law{law.state ? ` – ${law.state}` : ""}
                      </h2>
                      <div
                        className="print-state-law-content"
                        // Sanitize on render: state law content is user-supplied
                        // HTML from a contentEditable, which could otherwise
                        // carry <script> / <iframe> / event-handler payloads
                        // planted by any team member with summaries UPDATE
                        // access. Save-side sanitization also happens in
                        // SummaryFields.emit — defense in depth.
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(law.content) }}
                      />
                    </div>
                  </div>
                ))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {mounted ? createPortal(doc, document.body) : null}

      <style jsx global>{`
        @media screen {
          .summary-print-portal { display: none; }
        }
        @media print {
          /* Zero page margin so browser-default header (page title) and
             footer (URL) have nowhere to render. Our own padding inside. */
          @page { size: Letter; margin: 0; }
          html, body { background: white !important; margin: 0 !important; }

          /* Hide the entire app; show only the portaled summary document.
             Works no matter how deeply the trigger is nested. */
          body > :not(.summary-print-portal) { display: none !important; }
          .summary-print-portal { display: block !important; }
          .no-print, .screen-only { display: none !important; }

          .print-doc {
            display: table !important;
            width: 100%;
            border-collapse: collapse;
            color: #000;
            font-family: "Times New Roman", Times, serif;
            font-size: 12pt;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-doc td { color: #000; }

          /* thead repeats on every printed page */
          .print-repeated-header { display: table-header-group; }
          .print-repeated-header td {
            padding: 0.35in 0.6in 28pt 0.6in;
          }
          .print-doc tbody td {
            padding: 16pt 0.6in 0.4in 0.6in;
          }

          .print-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .print-logo {
            width: 3in;
            height: auto;
            object-fit: contain;
          }
          .print-tagline {
            font-weight: bold;
            font-size: 13pt;
            text-align: right;
            line-height: 1.3;
          }
          .print-title {
            text-align: center;
            font-size: 22pt;
            font-weight: bold;
            margin: 0 0 22pt 0;
          }
          .print-fields {
            margin: 0 0 14pt 0.4in;
          }
          .print-fields > div {
            margin-bottom: 8pt;
            page-break-inside: avoid;
          }
          .print-label { font-weight: bold; }
          .print-divider {
            border: 0;
            border-top: 1px solid #000;
            margin: 22pt 0;
          }
          .print-status-block {
            margin: 0 0 14pt 0.4in;
          }
          .print-status {
            margin-bottom: 8pt;
            page-break-inside: avoid;
          }
          .print-section {
            margin: 0 0 14pt 0;
            page-break-inside: auto;
          }
          .print-new-page {
            page-break-before: always;
          }
          .print-section-title {
            font-size: 16pt;
            font-weight: bold;
            margin: 0 0 10pt 0;
            text-align: left;
          }
          .print-bullets {
            margin: 0 0 0 0.6in;
            padding: 0;
          }
          .print-bullets li {
            margin-bottom: 8pt;
            page-break-inside: avoid;
          }

          /* State-law user content: preserve highlights, empty lines,
             and any bold/italic the user applied via the editor. */
          .print-state-law-content {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0;
          }
          .print-state-law-content * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-state-law-content div,
          .print-state-law-content p {
            margin: 0 0 6pt 0;
            min-height: 1em;
          }
          .print-state-law-content div:empty::before,
          .print-state-law-content p:empty::before {
            content: "\\00a0";
          }
        }
      `}</style>
    </>
  );
}

function opposingAppraiserLine(s: SavedSummary): string {
  const parts = [s.opposingAppraiser, s.oaCompany].filter(Boolean);
  return parts.join(", ");
}

function formatDateUS(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="print-label">{label}:</span> {value}
    </div>
  );
}
