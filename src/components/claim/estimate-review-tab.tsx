"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AlertCircle, FileText, Loader2, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClaimInfo } from "@/lib/acv/types";
import { CATEGORY_LABEL } from "@/lib/estimate-review/types";
import type { EstimateReview, Flag, FlagCategory } from "@/lib/estimate-review/types";
import { captureReviewPdf, reviewPdfFileName } from "@/lib/estimate-review/pdf";
import type { ClaimDocument } from "@/lib/supabase/documents";
import type { ClaimEstimate } from "./estimate-tab";

const CATEGORY_STYLE: Record<FlagCategory, string> = {
  not_included: "bg-red-100 text-red-800",
  overlap: "bg-blue-100 text-blue-800",
  excess_labor: "bg-amber-100 text-amber-800",
  duplicate: "bg-purple-100 text-purple-800",
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
            <tr key={i} className="border-b border-gray-100 align-top">
              <td className="px-4 py-3">
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
              <td className="px-4 py-3 text-gray-700 text-xs">
                {fmtBilled(flag.iaBilled)}
                {flag.iaBilled.total !== 0 && (
                  <div className="text-gray-500 mt-0.5">= {fmtMoney(flag.iaBilled.total)}</div>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gray-700 max-w-xs">
                <div className="text-gray-500 font-semibold mb-0.5">{flag.ruleReference}</div>
                <div className="italic text-gray-600 line-clamp-3" title={flag.ruleQuote}>
                  &ldquo;{flag.ruleQuote}&rdquo;
                </div>
              </td>
              <td className="px-4 py-3 text-gray-700 text-xs">
                {fmtSuggested(flag.suggested)}
                {flag.suggested.action !== "remove" && flag.suggested.total !== 0 && (
                  <div className="text-gray-500 mt-0.5">= {fmtMoney(flag.suggested.total)}</div>
                )}
              </td>
              <td className="px-4 py-3 text-right font-bold text-amber-700 tabular-nums">
                {flag.impact < 0 ? "-" : "+"}
                {fmtMoney(Math.abs(flag.impact))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MAX_PHOTOS = 10;

function buildEmptyEstimate(prev: ClaimEstimate | null): ClaimEstimate {
  return {
    savedAt: prev?.savedAt ?? new Date().toISOString(),
    fileNameA: prev?.fileNameA ?? "",
    fileNameB: prev?.fileNameB ?? "",
    softwareA: prev?.softwareA ?? "",
    softwareB: prev?.softwareB ?? "",
    grandTotalA: prev?.grandTotalA ?? 0,
    grandTotalB: prev?.grandTotalB ?? 0,
    totalDifference: prev?.totalDifference ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: prev?.result ?? ({ comparison: { summary: {}, laborRateDifferences: [], lineItemDifferences: [], matchingItems: [], keyFindings: [] } } as any),
    reviews: prev?.reviews ?? [],
  };
}

// ── Drop zone for one-or-more files ────────────────────────────────────────
function MultiDropZone({
  label,
  files,
  onAdd,
  onRemove,
  accept,
  hint,
  max,
}: {
  label: string;
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  accept: Record<string, string[]>;
  hint: string;
  max?: number;
}) {
  const disabled = max !== undefined && files.length >= max;
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!accepted.length) return;
      const room = max !== undefined ? Math.max(0, max - files.length) : accepted.length;
      onAdd(accepted.slice(0, room));
    },
    [files.length, max, onAdd],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept, disabled });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">{label}</label>
        {max !== undefined && (
          <span className="text-xs text-gray-400">
            {files.length}/{max}
          </span>
        )}
      </div>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-all",
          disabled
            ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
            : "cursor-pointer",
          !disabled && isDragActive
            ? "border-blue-500 bg-blue-50"
            : !disabled && "border-gray-300 bg-white hover:border-gray-400",
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">
          {disabled ? `Max ${max} reached` : isDragActive ? "Drop here…" : hint}
        </p>
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 p-2 rounded border border-gray-200 bg-gray-50 text-sm"
            >
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate flex-1 text-gray-800">{f.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-gray-400 hover:text-red-500 shrink-0"
                aria-label={`Remove ${f.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────
export function EstimateReviewTab({
  claim,
  estimate,
  onChange,
  onDocumentSaved,
}: {
  claim: ClaimInfo;
  estimate: ClaimEstimate | null;
  onChange: (next: ClaimEstimate) => void;
  onDocumentSaved?: (blob: Blob, name: string, source: ClaimDocument["source"]) => void;
}) {
  const reviews = estimate?.reviews ?? [];
  const [estimates, setEstimates] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(reviews.length === 0);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const vehicleLabel = [claim.year || "", claim.make, claim.model].filter(Boolean).join(" ");

  const handleRun = async () => {
    if (estimates.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const f of estimates) formData.append("estimates", f);
      for (const f of photos) formData.append("photos", f);
      const nextNumber = reviews.length + 1;
      formData.append("nextReviewNumber", String(nextNumber));

      const res = await fetch("/api/acv/review-estimate", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");

      const newReviews = (data.reviews ?? []) as EstimateReview[];
      const next = buildEmptyEstimate(estimate);
      next.reviews = [...newReviews, ...reviews]; // newest on top
      onChange(next);
      setEstimates([]);
      setPhotos([]);
      setShowUpload(false);

      // Auto-file successful reviews to Documents. Refs won't exist until React
      // renders the new cards, so defer one tick.
      if (onDocumentSaved) {
        setTimeout(async () => {
          for (const review of newReviews) {
            if (review.error || review.flags.length === 0) continue;
            const el = cardRefs.current[review.id];
            if (!el) continue;
            try {
              const blob = await captureReviewPdf(el);
              if (!blob) continue;
              onDocumentSaved(blob, reviewPdfFileName(review.reviewNumber, review.fileName), "estimate-review");
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

  const handleDeleteReview = (id: string) => {
    if (!confirm("Delete this review? This can't be undone.")) return;
    const next = buildEmptyEstimate(estimate);
    next.reviews = reviews.filter((r) => r.id !== id);
    onChange(next);
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
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-5 max-w-3xl">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Estimate Review</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload one or more estimates. Each gets its own review against the P-Pages rulebook.
              {vehicleLabel ? ` Results save to this claim (${vehicleLabel}).` : " Results save to this claim."}
            </p>
          </div>
          <MultiDropZone
            label="Estimates to review"
            files={estimates}
            onAdd={(files) => setEstimates((prev) => [...prev, ...files])}
            onRemove={(i) => setEstimates((prev) => prev.filter((_, idx) => idx !== i))}
            accept={{
              "application/pdf": [".pdf"],
              "image/*": [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp"],
            }}
            hint="Drop PDFs or images, or click to browse (drop multiple at once)"
          />
          <MultiDropZone
            label="Reference photos (optional)"
            files={photos}
            onAdd={(files) => setPhotos((prev) => [...prev, ...files])}
            onRemove={(i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
            accept={{ "image/*": [".jpg", ".jpeg", ".png", ".webp"] }}
            hint="Drop up to 10 vehicle photos for cross-checking"
            max={MAX_PHOTOS}
          />
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRun}
              disabled={estimates.length === 0 || loading}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading
                ? `Reviewing ${estimates.length} estimate${estimates.length === 1 ? "" : "s"}…`
                : "Run Review"}
            </Button>
            {reviews.length > 0 && !loading && (
              <button
                type="button"
                onClick={() => {
                  setShowUpload(false);
                  setError(null);
                  setEstimates([]);
                  setPhotos([]);
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
                  onClick={() => handleDeleteReview(review.id)}
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
              ) : review.flags.length === 0 ? (
                <div className="mt-3 p-3 rounded bg-green-50 border border-green-200 text-green-700 text-sm">
                  No P-Pages violations found. Estimate looks clean.
                </div>
              ) : (
                <>
                  <div className="mt-2 text-sm text-gray-600">
                    {review.flags.length} flag{review.flags.length === 1 ? "" : "s"} · total impact{" "}
                    <span className="font-bold text-amber-700">
                      -{fmtMoney(review.flags.reduce((sum, f) => sum + Math.abs(f.impact), 0))}
                    </span>
                    {review.grandTotalBilled > 0 && (
                      <span className="text-gray-400">
                        {" · IA billed "}{fmtMoney(review.grandTotalBilled)}
                      </span>
                    )}
                  </div>
                  <FlagTable flags={review.flags} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
