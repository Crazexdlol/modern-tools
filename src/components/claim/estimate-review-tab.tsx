"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { ClaimInfo } from "@/lib/acv/types";
import { CATEGORY_LABEL } from "@/lib/estimate-review/types";
import type {
  EstimateReview,
  Flag,
  FlagCategory,
  GuidelineFinding,
  LaborRateFinding,
  ManualEntry,
  PartsFinding,
  TaxFinding,
} from "@/lib/estimate-review/types";
import { extractLossState } from "@/lib/claim-state";
import { captureReviewPdf } from "@/lib/estimate-review/pdf";
import type { ClaimDocument } from "@/lib/supabase/documents";
import type { ClaimEstimate } from "./estimate-tab";

// Kept for backward-compat rendering of old reviews that have guidelineFindings
// persisted from before the Repair Library was removed. New reviews never
// produce these findings.
const GUIDELINE_TYPE_STYLE: Record<'missing' | 'forbidden' | 'conflict', string> = {
  missing: 'bg-amber-100 text-amber-800',
  forbidden: 'bg-red-100 text-red-800',
  conflict: 'bg-blue-100 text-blue-800',
};

const GUIDELINE_TYPE_LABEL: Record<'missing' | 'forbidden' | 'conflict', string> = {
  missing: 'Missing Procedure',
  forbidden: 'Not Permitted',
  conflict: 'Included/Not Included Conflict',
};

const CATEGORY_STYLE: Record<FlagCategory, string> = {
  not_included: "bg-red-100 text-red-800",
  overlap: "bg-blue-100 text-blue-800",
  excess_labor: "bg-amber-100 text-amber-800",
  duplicate: "bg-purple-100 text-purple-800",
  manual_entry: "bg-slate-200 text-slate-800",
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtBilled(a: { laborHours?: number; laborRate?: number; partPrice?: number; total: number }): string {
  const bits: string[] = [];
  if (a.laborHours) {
    bits.push(`${a.laborHours.toFixed(1)} hrs${a.laborRate ? ` @ ${fmtMoney(a.laborRate)}/hr` : ""}`);
  }
  if (a.partPrice) bits.push(`part ${fmtMoney(a.partPrice)}`);
  if (a.total && !a.laborHours && !a.partPrice) bits.push(fmtMoney(a.total));
  return bits.join(" · ") || fmtMoney(a.total);
}

function fmtSuggested(s: Flag["suggested"]): string {
  if (s.action === "remove") return "Remove";
  return fmtBilled(s);
}

function ManualEntriesTable({ entries }: { entries: ManualEntry[] }) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded">
          Manual Entries
        </span>
        <span className="text-xs text-gray-500">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"} — typed in by the appraiser (not from CCC database). Review each carefully.
        </span>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-y border-gray-200">
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Line</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">IA Billed</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Note</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i} className="border-b border-gray-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{entry.lineDescription}</div>
                  {entry.panelOrArea && (
                    <div className="text-xs text-gray-400 mt-0.5">{entry.panelOrArea}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700 text-xs">
                  {fmtBilled(entry.iaBilled)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 italic max-w-md">
                  {entry.note || <span className="text-gray-400 not-italic">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums text-sm">
                  {fmtMoney(entry.iaBilled.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlagTable({ flags }: { flags: Flag[] }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-gray-200">
            <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Line
            </th>
            <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              IA Billed
            </th>
            <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Rule
            </th>
            <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Suggested
            </th>
            <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Impact
            </th>
          </tr>
        </thead>
        <tbody>
          {flags.map((flag, i) => (
            <Fragment key={i}>
              <tr className="align-top border-t border-gray-200">
                <td className="px-4 pt-3 pb-1">
                  <div className="font-semibold text-gray-900">{flag.lineDescription}</div>
                  {flag.panelOrArea && (
                    <div className="text-xs text-gray-400 mt-0.5">{flag.panelOrArea}</div>
                  )}
                  <span
                    className={cn(
                      "inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      CATEGORY_STYLE[flag.category],
                    )}
                  >
                    {CATEGORY_LABEL[flag.category]}
                  </span>
                </td>
                <td className="px-4 pt-3 pb-1 text-gray-700 text-xs">
                  {fmtBilled(flag.iaBilled)}
                  {flag.iaBilled.total !== 0 && (
                    <div className="text-gray-500 mt-0.5">= {fmtMoney(flag.iaBilled.total)}</div>
                  )}
                </td>
                <td className="px-4 pt-3 pb-1 text-xs text-gray-700 max-w-xs">
                  <div className="text-gray-500 font-semibold mb-0.5">{flag.ruleReference}</div>
                  <div className="italic text-gray-600 line-clamp-3" title={flag.ruleQuote}>
                    &ldquo;{flag.ruleQuote}&rdquo;
                  </div>
                </td>
                <td className="px-4 pt-3 pb-1 text-gray-700 text-xs">
                  {fmtSuggested(flag.suggested)}
                  {flag.suggested.action !== "remove" && flag.suggested.total !== 0 && (
                    <div className="text-gray-500 mt-0.5">= {fmtMoney(flag.suggested.total)}</div>
                  )}
                </td>
                <td className="px-4 pt-3 pb-1 text-right font-bold text-amber-700 tabular-nums">
                  {flag.impact < 0 ? "-" : "+"}
                  {fmtMoney(Math.abs(flag.impact))}
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td colSpan={5} className="px-4 pt-1 pb-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                    Why this was flagged
                  </div>
                  <div className="text-sm text-gray-700 leading-relaxed">
                    {flag.reason}
                  </div>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Rough ETA for the review call, in seconds. Baseline 30s for the estimate + 5s per
// supporting doc + a bit more for subsequent estimates (they run 3-at-a-time in parallel
// on the server, so wall time grows less than linearly).
function estimateReviewSeconds(estimateCount: number, supportingCount: number): number {
  const perEstimate = 30 + Math.ceil(estimateCount / 3 - 1) * 20;
  const supporting = supportingCount * 5;
  return Math.max(20, perEstimate + supporting);
}

function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildEmptyEstimate(prev: ClaimEstimate | null): ClaimEstimate {
  return {
    savedAt: prev?.savedAt ?? new Date().toISOString(),
    reviews: prev?.reviews ?? [],
    assertedLaborRates: prev?.assertedLaborRates,
  };
}

function PartsFindingsTable({ findings }: { findings: PartsFinding[] }) {
  const impactRows = findings.filter((f) => f.type === 'price_mismatch' || f.type === 'qty_mismatch');
  const invoiceOrphans = findings.filter((f) => f.type === 'invoice_orphan');
  const estimateOrphans = findings.filter((f) => f.type === 'estimate_orphan');
  const total = impactRows.reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider bg-fuchsia-100 text-fuchsia-800 px-1.5 py-0.5 rounded">
          Parts vs. Invoices
        </span>
        <span className="text-xs text-gray-500">
          {impactRows.length} price/qty discrepanc{impactRows.length === 1 ? "y" : "ies"} · total impact{" "}
          <span className="font-bold text-amber-700">-{fmtMoney(total)}</span>
          {(invoiceOrphans.length > 0 || estimateOrphans.length > 0) && (
            <>
              {" · "}
              {invoiceOrphans.length > 0 && `${invoiceOrphans.length} invoice-only`}
              {invoiceOrphans.length > 0 && estimateOrphans.length > 0 && ", "}
              {estimateOrphans.length > 0 && `${estimateOrphans.length} estimate-only`}
            </>
          )}
        </span>
      </div>
      {impactRows.length > 0 && (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-200">
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Part</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Invoice</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Estimate</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Δ / Unit</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Impact</th>
              </tr>
            </thead>
            <tbody>
              {impactRows.map((f, i) => (
                <tr key={i} className="border-b border-gray-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{f.description}</div>
                    {f.partNumber && (
                      <div className="text-xs text-gray-500 mt-0.5 font-mono">{f.partNumber}</div>
                    )}
                    {f.matchedBy === 'description' && (
                      <div className="text-[10px] text-gray-400 mt-0.5">matched by description</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {f.invoice && (
                      <>
                        <div>{f.invoice.qty} × {fmtMoney(f.invoice.unitPrice)} = {fmtMoney(f.invoice.total)}</div>
                        <div className="text-gray-400 mt-0.5 truncate max-w-[180px]" title={f.invoice.fileName}>{f.invoice.fileName}</div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {f.estimate && (
                      <div>{f.estimate.qty} × {fmtMoney(f.estimate.unitPrice)} = {fmtMoney(f.estimate.total)}</div>
                    )}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right tabular-nums font-semibold",
                    f.priceDeltaPerUnit > 0 ? "text-amber-700" : f.priceDeltaPerUnit < 0 ? "text-green-700" : "text-gray-400",
                  )}>
                    {f.priceDeltaPerUnit !== 0 ? `${f.priceDeltaPerUnit > 0 ? "+" : ""}${fmtMoney(f.priceDeltaPerUnit)}` : "—"}
                    {f.qtyDelta !== 0 && <div className="text-[10px] font-normal text-gray-500">qty Δ {f.qtyDelta > 0 ? "+" : ""}{f.qtyDelta}</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-700">
                    {f.dollarImpact < 0 ? "-" : "+"}{fmtMoney(Math.abs(f.dollarImpact))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(invoiceOrphans.length > 0 || estimateOrphans.length > 0) && (
        <div className="mt-2 px-4 py-3 bg-slate-50 border-y border-slate-200 text-xs text-gray-600 space-y-2">
          {invoiceOrphans.length > 0 && (
            <div>
              <div className="font-semibold text-gray-700 mb-1">On invoice, not on estimate:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {invoiceOrphans.map((f, i) => (
                  <li key={i}>
                    <span className="text-gray-800">{f.description}</span>
                    {f.partNumber && <span className="text-gray-400 font-mono"> · {f.partNumber}</span>}
                    {f.invoice && <span className="text-gray-500"> — {fmtMoney(f.invoice.total)} ({f.invoice.fileName})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {estimateOrphans.length > 0 && (
            <div>
              <div className="font-semibold text-gray-700 mb-1">On estimate, no invoice:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {estimateOrphans.map((f, i) => (
                  <li key={i}>
                    <span className="text-gray-800">{f.description}</span>
                    {f.partNumber && <span className="text-gray-400 font-mono"> · {f.partNumber}</span>}
                    {f.estimate && <span className="text-gray-500"> — {fmtMoney(f.estimate.total)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaxFindingsTable({ findings }: { findings: TaxFinding[] }) {
  const noRuleRow = findings.find((f) => f.type === 'no_state_rule');
  const impactRows = findings.filter((f) => f.type !== 'no_state_rule');
  const total = impactRows.reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
          Sales Tax
        </span>
        <span className="text-xs text-gray-500">
          {noRuleRow ? (
            <span className="italic text-gray-500">{noRuleRow.reason}</span>
          ) : (
            <>
              {impactRows.length} discrepanc{impactRows.length === 1 ? "y" : "ies"} · total impact{" "}
              <span className="font-bold text-amber-700">-{fmtMoney(total)}</span>
              {impactRows[0]?.state && (
                <span className="text-gray-400"> · {impactRows[0].state} · {impactRows[0].ruleLabel}</span>
              )}
            </>
          )}
        </span>
      </div>
      {impactRows.length > 0 && (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-200">
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Component</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Base</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Estimate Tax</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Expected Tax</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Reason</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Impact</th>
              </tr>
            </thead>
            <tbody>
              {impactRows.map((f, i) => (
                <tr key={i} className="border-b border-gray-100 align-top">
                  <td className="px-4 py-3 font-semibold text-gray-900">{f.component}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtMoney(f.estimateAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtMoney(f.estimateTax)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtMoney(f.expectedTax)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-md">{f.reason}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-700">
                    {f.dollarImpact < 0 ? "-" : "+"}{fmtMoney(Math.abs(f.dollarImpact))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GuidelineFindingsTable({ findings }: { findings: GuidelineFinding[] }) {
  const total = findings.reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
          Guidelines
        </span>
        <span className="text-xs text-gray-500">
          {findings.length} finding{findings.length === 1 ? "" : "s"} from attached guideline docs
          {total > 0 && (
            <>
              {" · total impact "}
              <span className="font-bold text-amber-700">-{fmtMoney(total)}</span>
            </>
          )}
        </span>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-y border-gray-200">
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Operation / Type</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Document</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Reason</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Impact</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f, i) => (
              <tr key={i} className="border-b border-gray-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{f.operation || '—'}</div>
                  <span className={cn("inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", GUIDELINE_TYPE_STYLE[f.type])}>
                    {GUIDELINE_TYPE_LABEL[f.type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700 max-w-xs">
                  <div className="font-semibold text-gray-800">{f.documentTitle}</div>
                  {f.documentSection && (
                    <div className="text-gray-500">{f.documentSection}</div>
                  )}
                  {f.documentQuote && (
                    <div className="italic text-gray-500 mt-1 line-clamp-3" title={f.documentQuote}>
                      &ldquo;{f.documentQuote}&rdquo;
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 max-w-md">{f.reason}</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-700">
                  {f.dollarImpact !== 0
                    ? `${f.dollarImpact < 0 ? "-" : "+"}${fmtMoney(Math.abs(f.dollarImpact))}`
                    : <span className="text-gray-400 font-normal">Informational</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LaborRateFindingsTable({ findings }: { findings: LaborRateFinding[] }) {
  const total = findings.reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
          Labor Rates
        </span>
        <span className="text-xs text-gray-500">
          {findings.length} category discrepanc{findings.length === 1 ? "y" : "ies"} · total impact{" "}
          <span className="font-bold text-amber-700">-{fmtMoney(total)}</span>
        </span>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-y border-gray-200">
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Category</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Your Rate</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Estimate Rate</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Δ/hr</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Hours</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">Impact</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-semibold text-gray-900">{f.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtMoney(f.assertedRate)}/hr</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtMoney(f.estimateRate)}/hr</td>
                <td className={cn(
                  "px-4 py-2.5 text-right tabular-nums font-semibold",
                  f.diffPerHour > 0 ? "text-amber-700" : "text-green-700",
                )}>
                  {f.diffPerHour > 0 ? "+" : ""}{fmtMoney(f.diffPerHour)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{f.hoursOnEstimate.toFixed(1)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-amber-700">
                  {f.dollarImpact < 0 ? "-" : "+"}{fmtMoney(Math.abs(f.dollarImpact))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sources that represent generated outputs — not meaningful inputs for review.
const EXCLUDED_SOURCES: ClaimDocument["source"][] = [
  "acv-report",
  "award",
  "closing-notes",
  "summary",
  "dv-report",
  "estimate-review",
];

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ── Document picker — select from existing claim documents ─────────────────
function DocumentPicker({
  label,
  documents,
  multiSelect,
  selectedIds,
  onChange,
}: {
  label: string;
  documents: ClaimDocument[];
  multiSelect: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  // Docs available for selection (exclude generated-report sources)
  const pickable = documents.filter((d) => !EXCLUDED_SOURCES.includes(d.source));
  const selected = documents.filter((d) => selectedIds.includes(d.id));

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = (id: string) => {
    if (multiSelect) {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((x) => x !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      onChange(selectedIds.includes(id) ? [] : [id]);
    }
  };

  const remove = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-gray-700">{label}</label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((doc) => (
            <span
              key={doc.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-50 border border-blue-200 text-blue-800"
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[180px]" title={doc.name}>{doc.name}</span>
              <button
                type="button"
                onClick={() => remove(doc.id)}
                className="text-blue-400 hover:text-red-500 ml-0.5 shrink-0"
                aria-label={`Remove ${doc.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Placeholder when nothing selected */}
      {selected.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg px-4 py-3 text-center text-sm text-gray-400">
          {multiSelect ? "No documents selected" : "No document selected"}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2"
      >
        + Select from Documents
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-950/50 flex items-center justify-center z-50 p-4 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="bg-white rounded-xl w-full max-w-lg flex flex-col ring-1 ring-slate-200"
            style={{ maxHeight: "80vh", boxShadow: "var(--hp-elev-pop)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-[16px] font-semibold text-slate-900 tracking-tight">{label}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3">
              {pickable.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  No documents available. Upload files in the Documents tab first.
                </p>
              ) : (
                <ul className="space-y-1">
                  {pickable.map((doc) => {
                    const isChecked = selectedIds.includes(doc.id);
                    return (
                      <li key={doc.id}>
                        <label
                          className={cn(
                            "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors",
                            isChecked
                              ? "bg-blue-50 border border-blue-200"
                              : "border border-transparent hover:bg-gray-50",
                          )}
                        >
                          <input
                            type={multiSelect ? "checkbox" : "radio"}
                            checked={isChecked}
                            onChange={() => toggle(doc.id)}
                            className="shrink-0 accent-blue-600"
                          />
                          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate" title={doc.name}>
                              {doc.name}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              <span className="inline-block px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium mr-1.5">
                                {doc.source}
                              </span>
                              {fmtSize(doc.size)}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              {multiSelect && selectedIds.length > 0 && (
                <span className="text-xs text-gray-500 self-center mr-auto">
                  {selectedIds.filter((id) => pickable.some((d) => d.id === id)).length} selected
                </span>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="hp-btn hp-btn-secondary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────
export function EstimateReviewTab({
  claim,
  claimId,
  estimate,
  onChange,
  onDocumentSaved,
  documents,
}: {
  claim: ClaimInfo;
  claimId: string | null;
  estimate: ClaimEstimate | null;
  onChange: (next: ClaimEstimate) => void;
  onDocumentSaved?: (blob: Blob, name: string, source: ClaimDocument["source"]) => void;
  documents: ClaimDocument[];
}) {
  const reviews = estimate?.reviews ?? [];
  const [estimateDocId, setEstimateDocId] = useState<string | null>(null);
  const [supportingDocIds, setSupportingDocIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(reviews.length === 0);
  const [runStartMs, setRunStartMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [estimatedTotalSec, setEstimatedTotalSec] = useState(0);
  const [pendingDeleteReviewId, setPendingDeleteReviewId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Tick the elapsed clock while a run is in flight.
  useEffect(() => {
    if (!loading || runStartMs === null) return;
    const tick = () => setElapsedMs(Date.now() - runStartMs);
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [loading, runStartMs]);

  const handleRun = async () => {
    if (!estimateDocId) return;
    setLoading(true);
    setError(null);
    setRunStartMs(Date.now());
    setElapsedMs(0);
    setEstimatedTotalSec(estimateReviewSeconds(1, supportingDocIds.length));
    try {
      const claimState = extractLossState(claim.ownerAddress) ?? "";
      const nextNumber = reviews.length + 1;

      const res = await fetch("/api/acv/review-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateDocId,
          supportingDocIds,
          claimId: claimId ?? "",
          claimState,
          nextReviewNumber: nextNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");

      const newReviews = (data.reviews ?? []) as EstimateReview[];
      const next = buildEmptyEstimate(estimate);
      next.reviews = [...newReviews, ...reviews]; // newest on top
      onChange(next);
      setEstimateDocId(null);
      setSupportingDocIds([]);
      setShowUpload(false);

      // Auto-file successful reviews to Documents. Refs won't exist until React
      // renders the new cards, so defer one tick.
      if (onDocumentSaved) {
        setTimeout(async () => {
          for (const review of newReviews) {
            const hasFindings = review.flags.length > 0
              || (review.rateFindings?.length ?? 0) > 0
              || (review.partsFindings?.filter(f => f.type === 'price_mismatch' || f.type === 'qty_mismatch').length ?? 0) > 0
              || (review.guidelineFindings?.length ?? 0) > 0
              || (review.taxFindings?.filter(f => f.type !== 'no_state_rule').length ?? 0) > 0;
            if (review.error || !hasFindings) continue;
            const el = cardRefs.current[review.id];
            if (!el) continue;
            try {
              const blob = await captureReviewPdf(el);
              if (!blob) continue;
              onDocumentSaved(blob, `${claim.maNumber || 'claim'}-estimatedispute.pdf`, "estimate-review");
            } catch (err) {
              console.error("Failed to auto-file review PDF:", review.fileName, err);
            }
          }
        }, 150);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteReview = () => {
    if (!pendingDeleteReviewId) return;
    const next = buildEmptyEstimate(estimate);
    next.reviews = reviews.filter((r) => r.id !== pendingDeleteReviewId);
    onChange(next);
    setPendingDeleteReviewId(null);
  };

  return (
    <div className="space-y-5">
      {!showUpload && reviews.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() => setShowUpload(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
          >
            + Review Another Estimate
          </Button>
        </div>
      )}

      {showUpload && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Estimate Review</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DocumentPicker
              label="Estimate to review"
              documents={documents}
              multiSelect={false}
              selectedIds={estimateDocId ? [estimateDocId] : []}
              onChange={(ids) => setEstimateDocId(ids[0] ?? null)}
            />
            <DocumentPicker
              label="Supporting documents (photos, invoices, labor-rate sheets — auto-detected by filename)"
              documents={documents}
              multiSelect={true}
              selectedIds={supportingDocIds}
              onChange={setSupportingDocIds}
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRun}
              disabled={!estimateDocId || loading}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Reviewing estimate…" : "Run Review"}
            </Button>
            {loading && (
              <div className="text-xs text-gray-500 tabular-nums">
                Elapsed <span className="font-semibold text-gray-700">{fmtDuration(elapsedMs)}</span>
                {estimatedTotalSec > 0 && elapsedMs / 1000 <= estimatedTotalSec && (
                  <> · est. finish <span className="font-semibold text-gray-700">~{fmtDuration(estimatedTotalSec * 1000)}</span></>
                )}
                {estimatedTotalSec > 0 && elapsedMs / 1000 > estimatedTotalSec && (
                  <> · <span className="text-amber-600">taking longer than usual</span></>
                )}
              </div>
            )}
            {reviews.length > 0 && !loading && (
              <button
                type="button"
                onClick={() => {
                  setShowUpload(false);
                  setError(null);
                  setEstimateDocId(null);
                  setSupportingDocIds([]);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              ref={(el) => { cardRefs.current[review.id] = el; }}
              className="bg-white border border-gray-200 rounded-lg shadow-sm p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">
                    Review #{review.reviewNumber} · {review.fileName}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {review.software} · {new Date(review.savedAt).toLocaleString()}
                    {review.photoCount > 0
                      ? ` · ${review.photoCount} photo${review.photoCount === 1 ? "" : "s"}`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingDeleteReviewId(review.id)}
                  className="text-gray-300 hover:text-red-500 shrink-0"
                  aria-label="Delete review"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {review.error ? (
                <div className="mt-3 p-3 rounded bg-red-50 border border-red-200 text-red-600 text-sm">
                  Review failed: {review.error}
                </div>
              ) : review.flags.length === 0 && (review.manualEntries?.length ?? 0) === 0 && (review.rateFindings?.length ?? 0) === 0 && (review.partsFindings?.length ?? 0) === 0 && (review.guidelineFindings?.length ?? 0) === 0 && (review.taxFindings?.filter(f => f.type !== 'no_state_rule').length ?? 0) === 0 ? (
                <div className="mt-3 p-3 rounded bg-green-50 border border-green-200 text-green-700 text-sm">
                  No violations, manual entries, rate discrepancies, invoice mismatches, guideline findings, or tax issues. Estimate looks clean.
                </div>
              ) : (
                <>
                  {(() => {
                    const flagImpact = review.flags.reduce((sum, f) => sum + Math.abs(f.impact), 0);
                    const rateImpact = (review.rateFindings ?? []).reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
                    const partsImpact = (review.partsFindings ?? []).reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
                    const guidelineImpact = (review.guidelineFindings ?? []).reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
                    const taxImpact = (review.taxFindings ?? []).reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
                    const totalImpact = flagImpact + rateImpact + partsImpact + guidelineImpact + taxImpact;
                    if (totalImpact === 0) return null;
                    return (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-baseline justify-between gap-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                          Total disputed amount
                        </span>
                        <span className="text-2xl font-black tabular-nums text-amber-800">
                          -{fmtMoney(totalImpact)}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="mt-2 text-sm text-gray-600">
                    {(() => {
                      const flagImpact = review.flags.reduce((sum, f) => sum + Math.abs(f.impact), 0);
                      const rateImpact = (review.rateFindings ?? []).reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
                      const partsImpact = (review.partsFindings ?? []).reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
                      const guidelineImpact = (review.guidelineFindings ?? []).reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
                      const taxImpact = (review.taxFindings ?? []).reduce((sum, f) => sum + Math.abs(f.dollarImpact), 0);
                      const totalImpact = flagImpact + rateImpact + partsImpact + guidelineImpact + taxImpact;
                      return totalImpact > 0 ? (
                        <span className="text-gray-500">Breakdown:</span>
                      ) : (
                        <span className="text-gray-500">No dollar-impact findings.</span>
                      );
                    })()}
                    {review.flags.length > 0 && (
                      <span className="text-gray-500">
                        {" · "}{review.flags.length} P-Pages flag{review.flags.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {(review.rateFindings?.length ?? 0) > 0 && (
                      <span className="text-teal-700">
                        {" · "}{review.rateFindings!.length} rate discrepanc{review.rateFindings!.length === 1 ? "y" : "ies"}
                      </span>
                    )}
                    {(review.partsFindings?.filter(f => f.type === 'price_mismatch' || f.type === 'qty_mismatch').length ?? 0) > 0 && (
                      <span className="text-fuchsia-700">
                        {" · "}{review.partsFindings!.filter(f => f.type === 'price_mismatch' || f.type === 'qty_mismatch').length} invoice mismatch{review.partsFindings!.filter(f => f.type === 'price_mismatch' || f.type === 'qty_mismatch').length === 1 ? "" : "es"}
                      </span>
                    )}
                    {(review.guidelineFindings?.length ?? 0) > 0 && (
                      <span className="text-indigo-700">
                        {" · "}{review.guidelineFindings!.length} guideline finding{review.guidelineFindings!.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {(review.taxFindings?.filter(f => f.type !== 'no_state_rule').length ?? 0) > 0 && (
                      <span className="text-orange-700">
                        {" · "}{review.taxFindings!.filter(f => f.type !== 'no_state_rule').length} tax discrepanc{review.taxFindings!.filter(f => f.type !== 'no_state_rule').length === 1 ? "y" : "ies"}
                      </span>
                    )}
                    {(review.manualEntries?.length ?? 0) > 0 && (
                      <span className="text-slate-600">
                        {" · "}{review.manualEntries!.length} manual entr{review.manualEntries!.length === 1 ? "y" : "ies"}
                      </span>
                    )}
                    {review.grandTotalBilled > 0 && (
                      <span className="text-gray-400">
                        {" · IA billed "}{fmtMoney(review.grandTotalBilled)}
                      </span>
                    )}
                  </div>
                  {review.flags.length > 0 && <FlagTable flags={review.flags} />}
                  {(review.manualEntries?.length ?? 0) > 0 && (
                    <ManualEntriesTable entries={review.manualEntries!} />
                  )}
                  {(review.rateFindings?.length ?? 0) > 0 && (
                    <LaborRateFindingsTable findings={review.rateFindings!} />
                  )}
                  {(review.partsFindings?.length ?? 0) > 0 && (
                    <PartsFindingsTable findings={review.partsFindings!} />
                  )}
                  {(review.guidelineFindings?.length ?? 0) > 0 && (
                    <GuidelineFindingsTable findings={review.guidelineFindings!} />
                  )}
                  {(review.taxFindings?.length ?? 0) > 0 && (
                    <TaxFindingsTable findings={review.taxFindings!} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteReviewId !== null}
        title="Delete this review?"
        message="This will remove the review and its flags. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDeleteReview}
        onCancel={() => setPendingDeleteReviewId(null)}
      />
    </div>
  );
}
