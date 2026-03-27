"use client";

import { useState, useCallback, useRef, Fragment, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Upload, FileText, X, Loader2, AlertCircle, Printer, Trash2, ExternalLink, Plus, Search, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import { parseClaimPDF } from "@/lib/parse-claim-pdf";

// ─── Vehicle area sort order (front to back) ───────────────────────────────
const VEHICLE_AREA_ORDER: string[] = [
  "front bumper", "front end", "lower cover", "skid plate", "under cover", "grille", "upper grille",
  "headlamp", "headlight", "fog lamp", "foglamp", "hood", "cowl",
  "fender", "front fender", "wheel opening", "mud guard",
  "front door", "door shell", "door outer", "body side molding",
  "rocker", "hinge pillar", "ctr plr", "center pillar", "b-pillar", "b pillar",
  "rear door",
  "quarter", "quarter panel", "quarter glass", "roof rail", "drip molding",
  "roof", "roof rack",
  "rear bumper", "rear end", "trunk", "liftgate", "tailgate", "tail lamp", "taillamp",
  "windshield", "glass",
  "wheel", "tire", "alignment", "suspension",
  "exhaust", "converter", "muffler",
  "mechanical", "engine",
  "adas", "radar", "sensor", "calibration",
  "restraint", "air bag", "airbag", "belt", "seatbelt",
  "electrical", "hybrid",
  "miscellaneous", "misc", "trip charge", "sublet",
];

function vehicleAreaRank(area: string): number {
  const lower = area.toLowerCase();
  for (let i = 0; i < VEHICLE_AREA_ORDER.length; i++) {
    if (lower.includes(VEHICLE_AREA_ORDER[i])) return i;
  }
  return VEHICLE_AREA_ORDER.length;
}

const CATEGORY_ORDER = ["Labor", "Parts", "Paint", "Sublet", "Other"];

// ─── Claim Info ─────────────────────────────────────────────────────────────
interface EstimateClaimInfo {
  maNumber: string;
  claimNumber: string;
  dateOfLoss: string;
  insuredName: string;
  ownerPhone: string;
  ownerEmail: string;
  ownerAddress: string;
  insuranceCompany: string;
  adjuster: string;
  adjusterPhone: string;
  adjusterEmail: string;
  vin: string;
  year: string;
  make: string;
  model: string;
}

function defaultEstimateClaim(): EstimateClaimInfo {
  return {
    maNumber: "", claimNumber: "", dateOfLoss: "",
    insuredName: "", ownerPhone: "", ownerEmail: "", ownerAddress: "",
    insuranceCompany: "", adjuster: "", adjusterPhone: "", adjusterEmail: "",
    vin: "", year: "", make: "", model: "",
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────
interface LineItemDiff {
  status: string;
  category: string;
  normalizedOperation: string;
  panelOrArea: string;
  estimateA: Record<string, number | string>;
  estimateB: Record<string, number | string>;
  dollarImpact: number;
  notes: string;
}

interface ComparisonResult {
  comparison: {
    summary: {
      estimateA: Record<string, number | string>;
      estimateB: Record<string, number | string>;
      totalDifference: number;
      vehicle: Record<string, string>;
    };
    laborRateDifferences: Array<{ rateType: string; estimateA: number; estimateB: number; difference: number }>;
    lineItemDifferences: LineItemDiff[];
    matchingItems: Array<{ normalizedOperation: string; panelOrArea: string; category: string }>;
    keyFindings: string[];
  };
}

export interface HistoryEntry {
  id: string;
  date: string;
  vehicle: Record<string, string>;
  softwareA: string;
  softwareB: string;
  fileNameA: string;
  fileNameB: string;
  grandTotalA: number;
  grandTotalB: number;
  totalDifference: number;
  result: ComparisonResult;
  claim?: EstimateClaimInfo;
}

import { fetchEstimateHistory, saveEstimateHistory, deleteEstimateHistory, type EstimateHistoryEntry } from '@/lib/supabase/history'

async function saveToHistory(result: ComparisonResult, claim: EstimateClaimInfo, existingId?: string | null) {
  const { summary } = result.comparison;
  const aiVehicle = summary.vehicle ?? {};
  const mergedVehicle: Record<string, string> = {
    year: claim.year || aiVehicle.year || "",
    make: claim.make || aiVehicle.make || "",
    model: claim.model || aiVehicle.model || "",
    vin: claim.vin || aiVehicle.vin || "",
    color: aiVehicle.color || "",
  };
  const entry: EstimateHistoryEntry = {
    id: existingId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
    vehicle: mergedVehicle,
    softwareA: (summary.estimateA?.software as string) ?? "",
    softwareB: (summary.estimateB?.software as string) ?? "",
    fileNameA: (summary.estimateA?.fileName as string) ?? "Estimate A",
    fileNameB: (summary.estimateB?.fileName as string) ?? "Estimate B",
    grandTotalA: (summary.estimateA?.grandTotal as number) ?? 0,
    grandTotalB: (summary.estimateB?.grandTotal as number) ?? 0,
    totalDifference: summary.totalDifference ?? 0,
    result,
    claim,
  };
  await saveEstimateHistory(entry);
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function fmt(val: number | string | undefined): string {
  if (val === undefined || val === null || val === "") return "—";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num) || num === 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function extractOpLabel(rawOp: string | undefined, status: string, side: "a" | "b"): string {
  if (status === "only_in_a" && side === "b") return "Not Included";
  if (status === "only_in_b" && side === "a") return "Not Included";
  if (!rawOp || rawOp.trim() === "") return "Included";
  const lower = rawOp.toLowerCase().trim();
  if (lower.startsWith("repl") || lower.startsWith("replace")) return "Replace";
  if (lower.startsWith("rpr") || lower.startsWith("repair")) return "Repair";
  if (lower.startsWith("r&i") || lower.startsWith("r/i")) return "R&I";
  if (lower.startsWith("r&r") || lower.startsWith("r/r")) return "R&R";
  if (lower.startsWith("blnd") || lower.startsWith("blend")) return "Blend";
  if (lower.startsWith("refn") || lower.startsWith("ref ") || lower.startsWith("refinish")) return "Refinish";
  if (lower.startsWith("subl") || lower.startsWith("sublet")) return "Sublet";
  if (lower.startsWith("recond")) return "Reconditioned";
  if (lower.startsWith("aim")) return "Aim";
  if (lower.startsWith("scan")) return "Scan";
  if (lower.startsWith("diag")) return "Diagnose";
  if (lower.startsWith("align")) return "Align";
  const firstWord = rawOp.trim().split(/\s+/)[0];
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

function getDisplayValue(est: Record<string, number | string> | undefined, category: string, status: string, side: "a" | "b"): string {
  if (status === "only_in_a" && side === "b") return "—";
  if (status === "only_in_b" && side === "a") return "—";
  if (!est) return "—";
  const laborHours = Number(est.laborHours) || 0;
  const total = Number(est.total) || 0;
  const partPrice = Number(est.partPrice) || 0;
  if (category === "Labor" && laborHours && !total && !partPrice) return `${laborHours.toFixed(1)} hrs`;
  if (total) return fmt(total);
  if (partPrice) return fmt(partPrice);
  if (laborHours) return `${laborHours.toFixed(1)} hrs`;
  return "—";
}

function getDiffType(item: LineItemDiff): string {
  if (item.status === "only_in_a") return item.category === "Labor" || item.category === "Sublet" ? "Missing Procedure" : "Missing Item";
  if (item.status === "only_in_b") return item.category === "Labor" || item.category === "Sublet" ? "Missing Procedure" : "Missing Item";
  const aOp = extractOpLabel(item.estimateA?.rawOperation as string, item.status, "a");
  const bOp = extractOpLabel(item.estimateB?.rawOperation as string, item.status, "b");
  const opPairs = [["Replace", "Repair"], ["Replace", "Blend"], ["Replace", "R&I"], ["Repair", "Blend"]];
  for (const [x, y] of opPairs) {
    if ((aOp === x && bOp === y) || (aOp === y && bOp === x)) return `${aOp} vs ${bOp}`;
  }
  const aHrs = Number(item.estimateA?.laborHours) || 0;
  const bHrs = Number(item.estimateB?.laborHours) || 0;
  if (aHrs !== bHrs && item.category === "Labor") return "Labor Hours";
  return "Price Difference";
}

function getDiffDisplay(item: LineItemDiff): string {
  const impact = item.dollarImpact ?? 0;
  const aHrs = Number(item.estimateA?.laborHours) || 0;
  const bHrs = Number(item.estimateB?.laborHours) || 0;
  const aTotal = Number(item.estimateA?.total) || 0;
  const bTotal = Number(item.estimateB?.total) || 0;

  if (item.status === "only_in_a") {
    if (aTotal) return `+${fmt(aTotal)}`;
    if (aHrs) return `+${aHrs.toFixed(1)} hrs`;
    return impact !== 0 ? `+${fmt(Math.abs(impact))}` : "—";
  }
  if (item.status === "only_in_b") {
    if (bTotal) return `-${fmt(bTotal)}`;
    if (bHrs) return `-${bHrs.toFixed(1)} hrs`;
    return impact !== 0 ? `-${fmt(Math.abs(impact))}` : "—";
  }
  if (item.category === "Labor" && aHrs !== bHrs && !aTotal && !bTotal) {
    const hDiff = aHrs - bHrs;
    return `${hDiff > 0 ? "+" : ""}${hDiff.toFixed(1)} hrs`;
  }
  if (impact !== 0) return `${impact > 0 ? "+" : ""}${fmt(impact)}`;
  const dollarDiff = aTotal - bTotal;
  if (dollarDiff !== 0) return `${dollarDiff > 0 ? "+" : ""}${fmt(dollarDiff)}`;
  return "—";
}

function sortedDiffs(diffs: LineItemDiff[]): LineItemDiff[] {
  return [...diffs].sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category);
    const catB = CATEGORY_ORDER.indexOf(b.category);
    if (catA !== catB) return (catA === -1 ? 99 : catA) - (catB === -1 ? 99 : catB);
    return vehicleAreaRank(a.panelOrArea) - vehicleAreaRank(b.panelOrArea);
  });
}

function groupByPanel(diffs: LineItemDiff[]): Map<string, LineItemDiff[]> {
  const map = new Map<string, LineItemDiff[]>();
  for (const item of diffs) {
    const panel = item.panelOrArea || item.normalizedOperation || "Other";
    if (!map.has(panel)) map.set(panel, []);
    map.get(panel)!.push(item);
  }
  // Sort panels by vehicle area order
  const sorted = new Map(
    [...map.entries()].sort((a, b) => vehicleAreaRank(a[0]) - vehicleAreaRank(b[0]))
  );
  return sorted;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  });
}

// ─── Upload Zone ───────────────────────────────────────────────────────────
function FileUploadZone({ label, file, onDrop, onRemove }: {
  label: string; file: File | null;
  onDrop: (f: File) => void; onRemove: () => void;
}) {
  const handleDrop = useCallback((accepted: File[]) => { if (accepted[0]) onDrop(accepted[0]); }, [onDrop]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { "application/pdf": [".pdf"], "image/*": [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp"] },
    maxFiles: 1, disabled: !!file,
  });

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-gray-700">{label}</label>
      {file ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-sm text-gray-800 truncate flex-1">{file.name}</span>
          <span className="text-xs text-gray-400 shrink-0">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
          <button onClick={onRemove} className="text-gray-400 hover:text-gray-600 shrink-0"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div {...getRootProps()} className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
          isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white hover:border-gray-400"
        )}>
          <input {...getInputProps()} />
          <Upload className="w-7 h-7 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{isDragActive ? "Drop it here..." : "Drop PDF or image, or click to browse"}</p>
          <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, TIFF</p>
        </div>
      )}
    </div>
  );
}

// ─── Results ───────────────────────────────────────────────────────────────
function Results({ result, onReset, onEdit, onBack, onSave }: {
  result: ComparisonResult; onReset: () => void; onEdit: () => void; onBack: () => void;
  onSave: (updated: ComparisonResult) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ComparisonResult>(JSON.parse(JSON.stringify(result)));

  // Reset draft when result changes (e.g. new comparison)
  useEffect(() => { setDraft(JSON.parse(JSON.stringify(result))); setIsEditing(false); }, [result]);

  const data = isEditing ? draft : result;
  const { summary, laborRateDifferences, lineItemDifferences, matchingItems, keyFindings } = data.comparison;
  const grouped = groupByPanel(sortedDiffs(lineItemDifferences ?? []));

  // Helpers for editing draft
  const setSummaryField = (side: "estimateA" | "estimateB", key: string, val: number) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.comparison.summary[side][key] = val;
      // Recalculate grand total
      const est = next.comparison.summary[side];
      est.grandTotal = (Number(est.laborTotal) || 0) + (Number(est.partsTotal) || 0) + (Number(est.paintTotal) || 0) + (Number(est.subletTotal) || 0) + (Number(est.taxTotal) || 0);
      next.comparison.summary.totalDifference = (Number(next.comparison.summary.estimateA.grandTotal) || 0) - (Number(next.comparison.summary.estimateB.grandTotal) || 0);
      return next;
    });
  };

  const setLaborRate = (idx: number, side: "estimateA" | "estimateB", val: number) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.comparison.laborRateDifferences[idx][side] = val;
      next.comparison.laborRateDifferences[idx].difference = (Number(next.comparison.laborRateDifferences[idx].estimateA) || 0) - (Number(next.comparison.laborRateDifferences[idx].estimateB) || 0);
      return next;
    });
  };

  const setLineItem = (flatIdx: number, side: "estimateA" | "estimateB", field: string, val: number | string) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const item = next.comparison.lineItemDifferences[flatIdx];
      if (side === "estimateA" || side === "estimateB") {
        item[side][field] = val;
      } else {
        (item as Record<string, unknown>)[field] = val;
      }
      // Recalculate dollarImpact
      const aTotal = Number(item.estimateA?.total) || 0;
      const bTotal = Number(item.estimateB?.total) || 0;
      item.dollarImpact = aTotal - bTotal;
      return next;
    });
  };

  const setLineItemPanel = (flatIdx: number, val: string) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.comparison.lineItemDifferences[flatIdx].panelOrArea = val;
      return next;
    });
  };

  const setLineItemStatus = (flatIdx: number, val: string) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.comparison.lineItemDifferences[flatIdx].status = val;
      return next;
    });
  };

  const removeLineItem = (flatIdx: number) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.comparison.lineItemDifferences.splice(flatIdx, 1);
      return next;
    });
  };

  const addLineItem = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.comparison.lineItemDifferences.push({
        status: "different",
        category: "Labor",
        normalizedOperation: "",
        panelOrArea: "",
        estimateA: { rawOperation: "", laborHours: 0, laborRate: 0, laborTotal: 0, partType: "", partPrice: 0, total: 0 },
        estimateB: { rawOperation: "", laborHours: 0, laborRate: 0, laborTotal: 0, partType: "", partPrice: 0, total: 0 },
        dollarImpact: 0,
        notes: "",
      });
      return next;
    });
  };

  const setKeyFinding = (idx: number, val: string) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.comparison.keyFindings[idx] = val;
      return next;
    });
  };

  const removeKeyFinding = (idx: number) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.comparison.keyFindings.splice(idx, 1);
      return next;
    });
  };

  const addKeyFinding = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next.comparison.keyFindings) next.comparison.keyFindings = [];
      next.comparison.keyFindings.push("");
      return next;
    });
  };

  const handleSave = () => {
    onSave(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(JSON.parse(JSON.stringify(result)));
    setIsEditing(false);
  };

  // Build flat index map for line items so we can reference the original array index
  const flatItems: { item: LineItemDiff; flatIdx: number; panel: string; isFirstInPanel: boolean }[] = [];
  for (const [panel, items] of grouped.entries()) {
    items.forEach((item, i) => {
      const flatIdx = (isEditing ? draft : result).comparison.lineItemDifferences.indexOf(item);
      flatItems.push({ item, flatIdx, panel, isFirstInPanel: i === 0 });
    });
  }

  const totalDiff = summary.totalDifference ?? 0;
  const estAName = (summary.estimateA?.fileName as string) || "Estimate A";
  const estBName = (summary.estimateB?.fileName as string) || "Estimate B";
  const estASoftware = (summary.estimateA?.software as string) || "";
  const estBSoftware = (summary.estimateB?.software as string) || "";

  const diffColor = (val: number) => val > 0 ? "text-amber-600" : val < 0 ? "text-green-600" : "text-gray-400";

  const editInput = "bg-white border border-gray-300 rounded px-2 py-1 text-sm text-right tabular-nums w-28 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const editInputLeft = "bg-white border border-gray-300 rounded px-2 py-1 text-sm tabular-nums w-full focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; font-size: 11px; }
          .print-page { background: white !important; color: black !important; padding: 0 !important; }
          .result-section { border: 1px solid #ccc !important; margin-bottom: 14px !important; background: white !important; break-inside: avoid; }
          .section-header { background: #f0f0f0 !important; color: black !important; }
          table { font-size: 10px !important; width: 100% !important; }
          th { background: #f0f0f0 !important; color: black !important; }
          td, th { padding: 4px 8px !important; }
          .text-gray-900, .text-gray-800, .text-gray-700 { color: black !important; }
          .text-gray-500, .text-gray-400 { color: #666 !important; }
          .text-amber-600 { color: #b45309 !important; }
          .text-green-600 { color: #166534 !important; }
          .text-blue-600 { color: #1d4ed8 !important; }
          .text-orange-600 { color: #c2410c !important; }
          .border-gray-200, .border-gray-300 { border-color: #ccc !important; }
          .bg-gray-100, .bg-gray-50, .bg-white { background: white !important; }
          .op-badge { border: 1px solid #ccc !important; background: #f5f5f5 !important; color: black !important; }
          .status-badge-a { background: #fff3e0 !important; color: #b45309 !important; }
          .status-badge-b { background: #e3f2fd !important; color: #1565c0 !important; }
          .status-badge-diff { background: #fffde7 !important; color: #856404 !important; }
          .total-row { background: #f0f0f0 !important; }
        }
      `}</style>

      <div className="print-page">
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={onBack} className="border-gray-200 text-gray-600 hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Comparison Results</h2>
              {summary.vehicle?.year && (
                <p className="text-gray-500 text-sm mt-1">
                  {summary.vehicle.year} {summary.vehicle.make} {summary.vehicle.model}
                  {summary.vehicle.vin ? ` · VIN: ${summary.vehicle.vin}` : ""}
                  {summary.vehicle.color ? ` · ${summary.vehicle.color}` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel} className="border-gray-200 text-gray-700 hover:bg-gray-100">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5">
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="border-gray-200 text-gray-700 hover:bg-gray-100 gap-1.5">
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={onEdit} className="border-gray-200 text-gray-700 hover:bg-gray-100 gap-1.5">
                  <Upload className="w-4 h-4" /> Re-upload
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()} className="border-gray-200 text-gray-700 hover:bg-gray-100 gap-1.5">
                  <Printer className="w-4 h-4" /> Print
                </Button>
                <Button variant="outline" size="sm" onClick={onReset} className="border-gray-200 text-gray-700 hover:bg-gray-100">
                  Estimate Scan
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block mb-4 border-b pb-3">
          <h1 className="text-lg font-bold">Estimate Dispute — Comparison Report</h1>
          {summary.vehicle?.year && (
            <p className="text-sm text-gray-600">
              {summary.vehicle.year} {summary.vehicle.make} {summary.vehicle.model}
              {summary.vehicle.vin ? ` · VIN: ${summary.vehicle.vin}` : ""}
              {summary.vehicle.color ? ` · ${summary.vehicle.color}` : ""}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">Generated {new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}</p>
        </div>

        {isEditing && (
          <div className="no-print mb-5 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
            Editing mode — click any value to change it. Save when done.
          </div>
        )}

        {/* ── Est A vs Est B Summary ── */}
        <div className="result-section rounded-lg border border-gray-200 bg-white shadow-sm mb-5 overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200">
            <div className="p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Estimate A</p>
              <p className="text-gray-900 font-semibold text-sm truncate" title={estAName}>{estAName}</p>
              {estASoftware && <p className="text-xs text-gray-500 mt-0.5">{estASoftware}</p>}
            </div>
            <div className="p-4 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Difference</p>
              <p className={`text-2xl font-bold ${diffColor(totalDiff)}`}>
                {totalDiff !== 0 ? `${totalDiff > 0 ? "+" : ""}${fmt(totalDiff)}` : "No Difference"}
              </p>
              {totalDiff !== 0 && <p className="text-xs text-gray-400 mt-0.5">{totalDiff > 0 ? "A is higher" : "B is higher"}</p>}
            </div>
            <div className="p-4 text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Estimate B</p>
              <p className="text-gray-900 font-semibold text-sm truncate" title={estBName}>{estBName}</p>
              {estBSoftware && <p className="text-xs text-gray-500 mt-0.5">{estBSoftware}</p>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Category", "Est A", "Est B", "Difference"].map((h, i) => (
                    <th key={h} className={`px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider ${i === 0 ? "text-left w-1/4" : "text-right w-1/4"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Labor", key: "laborTotal" },
                  { label: "Parts", key: "partsTotal" },
                  { label: "Paint", key: "paintTotal" },
                  { label: "Sublet", key: "subletTotal" },
                  { label: "Tax", key: "taxTotal" },
                  { label: "Grand Total", key: "grandTotal", bold: true },
                ].map(({ label, key, bold }) => {
                  const a = (summary.estimateA?.[key] as number) || 0;
                  const b = (summary.estimateB?.[key] as number) || 0;
                  const diff = a - b;
                  const isGrandTotal = key === "grandTotal";
                  return (
                    <tr key={key} className={`border-b border-gray-100 ${bold ? "bg-gray-50 total-row" : ""}`}>
                      <td className={`px-4 py-2.5 ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>{label}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                        {isEditing && !isGrandTotal ? (
                          <input type="number" step="0.01" className={editInput} value={a || ""} onChange={(e) => setSummaryField("estimateA", key, parseFloat(e.target.value) || 0)} />
                        ) : fmt(a)}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                        {isEditing && !isGrandTotal ? (
                          <input type="number" step="0.01" className={editInput} value={b || ""} onChange={(e) => setSummaryField("estimateB", key, parseFloat(e.target.value) || 0)} />
                        ) : fmt(b)}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${diff !== 0 ? diffColor(diff) : "text-gray-300"}`}>
                        {diff !== 0 ? `${diff > 0 ? "+" : ""}${fmt(diff)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Labor Rates ── */}
        {laborRateDifferences?.length > 0 && (
          <div className="result-section rounded-lg border border-gray-200 bg-white shadow-sm mb-5 overflow-hidden">
            <div className="section-header px-4 py-2.5 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Labor Rates</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Rate Type", "Est A", "Est B", "Difference"].map((h, i) => (
                    <th key={h} className={`px-4 py-2 text-xs text-gray-500 font-medium ${i === 0 ? "text-left w-2/5" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {laborRateDifferences.map((rate, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-4 py-2.5 text-gray-700">{rate.rateType}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {isEditing ? (
                        <input type="number" step="0.01" className={editInput} value={rate.estimateA || ""} onChange={(e) => setLaborRate(i, "estimateA", parseFloat(e.target.value) || 0)} />
                      ) : rate.estimateA ? `${fmt(rate.estimateA)}/hr` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {isEditing ? (
                        <input type="number" step="0.01" className={editInput} value={rate.estimateB || ""} onChange={(e) => setLaborRate(i, "estimateB", parseFloat(e.target.value) || 0)} />
                      ) : rate.estimateB ? `${fmt(rate.estimateB)}/hr` : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${rate.difference !== 0 ? diffColor(rate.difference) : "text-gray-300"}`}>
                      {rate.difference !== 0 ? `${rate.difference > 0 ? "+" : ""}${fmt(rate.difference)}/hr` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Operations by Panel/Part ── */}
        <div className="result-section rounded-lg border border-gray-200 bg-white shadow-sm mb-5 overflow-hidden">
          <div className="section-header px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Operations</h3>
            {isEditing && (
              <Button variant="outline" size="sm" onClick={addLineItem} className="border-gray-300 text-gray-600 hover:bg-gray-100 gap-1 text-xs h-7">
                <Plus className="w-3 h-3" /> Add Line
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider w-[30%]">Part</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider w-[25%]">Estimate A</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider w-[25%]">Estimate B</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider w-[20%]">Difference</th>
                </tr>
              </thead>
              <tbody>
                {flatItems.map(({ item, flatIdx, panel, isFirstInPanel }) => {
                  const aOp = extractOpLabel(item.estimateA?.rawOperation as string, item.status, "a");
                  const bOp = extractOpLabel(item.estimateB?.rawOperation as string, item.status, "b");
                  const diffVal = item.dollarImpact ?? 0;
                  const aHrs = Number(item.estimateA?.laborHours) || 0;
                  const bHrs = Number(item.estimateB?.laborHours) || 0;
                  const aTotal = Number(item.estimateA?.total) || 0;
                  const bTotal = Number(item.estimateB?.total) || 0;
                  const aPartPrice = Number(item.estimateA?.partPrice) || 0;
                  const bPartPrice = Number(item.estimateB?.partPrice) || 0;
                  const hrsDiff = aHrs - bHrs;
                  const partDiff = aPartPrice - bPartPrice;

                  const formatCell = (side: "estimateA" | "estimateB", op: string, hrs: number, partPrice: number, total: number) => {
                    if (!isEditing) {
                      if (op === "Not Included") return <span className="text-gray-400 italic">Not Included</span>;
                      return (
                        <div className="space-y-0.5">
                          <div className="font-medium text-gray-800">{op}</div>
                          {hrs > 0 && <div className="text-xs text-gray-500">{hrs.toFixed(1)} hrs</div>}
                          {partPrice > 0 && <div className="text-xs text-gray-500">{fmt(partPrice)}</div>}
                          {total > 0 && total !== partPrice && <div className="text-xs text-gray-700 font-medium">{fmt(total)}</div>}
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-1">
                        <input className={editInputLeft} placeholder="Operation" value={(item[side]?.rawOperation as string) || ""} onChange={(e) => setLineItem(flatIdx, side, "rawOperation", e.target.value)} />
                        <input type="number" step="0.1" className={editInputLeft} placeholder="Hours" value={hrs || ""} onChange={(e) => setLineItem(flatIdx, side, "laborHours", parseFloat(e.target.value) || 0)} />
                        <input type="number" step="0.01" className={editInputLeft} placeholder="Part $" value={partPrice || ""} onChange={(e) => setLineItem(flatIdx, side, "partPrice", parseFloat(e.target.value) || 0)} />
                        <input type="number" step="0.01" className={editInputLeft} placeholder="Total $" value={total || ""} onChange={(e) => setLineItem(flatIdx, side, "total", parseFloat(e.target.value) || 0)} />
                      </div>
                    );
                  };

                  return (
                    <tr key={`${panel}-${flatIdx}`} className={`border-b border-gray-100 ${isFirstInPanel ? "border-t border-gray-200" : ""}`}>
                      <td className={`px-4 py-2.5 align-top ${isFirstInPanel ? "font-semibold text-gray-900" : "text-gray-400 text-xs pl-8"}`}>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input className={editInputLeft} value={item.panelOrArea || ""} onChange={(e) => setLineItemPanel(flatIdx, e.target.value)} />
                            <button onClick={() => removeLineItem(flatIdx)} className="text-gray-300 hover:text-red-500 shrink-0 p-0.5"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          isFirstInPanel ? panel : (item.normalizedOperation || item.category)
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-top text-sm">
                        {formatCell("estimateA", aOp, aHrs, aPartPrice, aTotal)}
                      </td>
                      <td className="px-4 py-2.5 align-top text-sm">
                        {formatCell("estimateB", bOp, bHrs, bPartPrice, bTotal)}
                      </td>
                      <td className="px-4 py-2.5 align-top tabular-nums">
                        {isEditing ? (
                          <div className="text-sm text-gray-500">
                            {diffVal !== 0 ? `${diffVal > 0 ? "+" : ""}${fmt(diffVal)}` : "—"}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {aOp !== bOp && aOp !== "Not Included" && bOp !== "Not Included" && (
                              <div className="text-sm font-bold text-orange-600">{aOp} vs {bOp}</div>
                            )}
                            {(item.status === "only_in_a" || item.status === "only_in_b") && (
                              <div className="text-sm font-bold text-orange-600">
                                {item.status === "only_in_a" ? "Only in A" : "Only in B"}
                              </div>
                            )}
                            {hrsDiff !== 0 && (
                              <div className={`text-sm font-bold ${diffColor(hrsDiff)}`}>
                                {hrsDiff > 0 ? "+" : ""}{hrsDiff.toFixed(1)} hrs
                              </div>
                            )}
                            {partDiff !== 0 && (
                              <div className={`text-sm font-bold ${diffColor(partDiff)}`}>
                                {partDiff > 0 ? "+" : ""}{fmt(partDiff)}
                              </div>
                            )}
                            {diffVal !== 0 && partDiff === 0 && hrsDiff === 0 && (
                              <div className={`text-sm font-bold ${diffColor(diffVal)}`}>
                                {diffVal > 0 ? "+" : ""}{fmt(diffVal)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Matching Items ── */}
        {matchingItems?.length > 0 && (
          <div className="result-section rounded-lg border border-gray-200 bg-white shadow-sm mb-5 overflow-hidden">
            <div className="section-header px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Matching Items (Agreed)</h3>
              <span className="text-xs text-gray-400">{matchingItems.length} items</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 px-4 py-3">
              {matchingItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="truncate">{item.normalizedOperation}{item.panelOrArea ? ` — ${item.panelOrArea}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Key Findings (bottom) ── */}
        {(keyFindings?.length > 0 || isEditing) && (
          <div className="result-section rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="section-header px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Key Findings</h3>
              {isEditing && (
                <Button variant="outline" size="sm" onClick={addKeyFinding} className="border-gray-300 text-gray-600 hover:bg-gray-100 gap-1 text-xs h-7">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              )}
            </div>
            {isEditing ? (
              <div className="px-4 py-3 space-y-2">
                {(keyFindings ?? []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className="flex-1 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" value={f} onChange={(e) => setKeyFinding(i, e.target.value)} />
                    <button onClick={() => removeKeyFinding(i)} className="text-gray-300 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="px-4 py-3 space-y-1.5">
                {(keyFindings ?? []).map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-amber-600 font-bold shrink-0 mt-0.5">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Claim Info Form ────────────────────────────────────────────────────────
function ClaimInfoFormEstimate({ claim, onChange, decoding, onDecodeVin }: {
  claim: EstimateClaimInfo;
  onChange: (c: EstimateClaimInfo) => void;
  decoding: boolean;
  onDecodeVin: () => void;
}) {
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSuccess, setPdfSuccess] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const set = (field: keyof EstimateClaimInfo, value: string) =>
    onChange({ ...claim, [field]: value });

  const handlePdfUpload = async (file: File) => {
    setPdfUploading(true);
    setPdfError(null);
    setPdfSuccess(false);
    try {
      const data = await parseClaimPDF(file);
      onChange({
        ...claim,
        maNumber: data.maNumber || claim.maNumber,
        claimNumber: data.claimNumber || claim.claimNumber,
        dateOfLoss: data.dateOfLoss || claim.dateOfLoss,
        insuredName: data.insuredName || claim.insuredName,
        ownerPhone: data.ownerPhone || claim.ownerPhone,
        ownerEmail: data.ownerEmail || claim.ownerEmail,
        ownerAddress: data.ownerAddress || claim.ownerAddress,
        insuranceCompany: data.insuranceCompany || claim.insuranceCompany,
        adjuster: data.adjuster || claim.adjuster,
        adjusterPhone: data.adjusterPhone || claim.adjusterPhone,
        adjusterEmail: data.adjusterEmail || claim.adjusterEmail,
        vin: data.vin || claim.vin,
        year: String(data.year || "") || claim.year,
        make: data.make || claim.make,
        model: data.model || claim.model,
      });
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 3000);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "PDF parse failed");
    } finally {
      setPdfUploading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const inputCls = "w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";

  return (
    <div className="space-y-6">
      {/* PDF Upload */}
      <div className="flex items-center gap-3">
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePdfUpload(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`gap-2 border-dashed ${pdfSuccess ? "border-emerald-500 text-emerald-600" : ""}`}
          disabled={pdfUploading}
          onClick={() => pdfInputRef.current?.click()}
        >
          {pdfUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : pdfSuccess ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {pdfUploading ? "Parsing..." : pdfSuccess ? "Filled!" : "Upload Claim PDF"}
        </Button>
        <span className="text-xs text-gray-400">Auto-fill from a claim assignment PDF</span>
        {pdfError && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {pdfError}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Report Info</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>MA Number</label>
            <input className={inputCls} placeholder="MA-12345" value={claim.maNumber} onChange={(e) => set("maNumber", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Insurance Claim #</label>
            <input className={inputCls} placeholder="CLM-00001" value={claim.claimNumber} onChange={(e) => set("claimNumber", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Date of Loss</label>
            <input type="date" className={inputCls} value={claim.dateOfLoss} onChange={(e) => set("dateOfLoss", e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Owner / Client</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Insured / Owner Name</label>
            <input className={inputCls} placeholder="John Smith" value={claim.insuredName} onChange={(e) => set("insuredName", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Owner Phone</label>
            <input className={inputCls} placeholder="(555) 000-0000" value={claim.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Owner Email</label>
            <input className={inputCls} placeholder="owner@email.com" value={claim.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Owner Address</label>
            <input className={inputCls} placeholder="123 Main St, City, ST 00000" value={claim.ownerAddress} onChange={(e) => set("ownerAddress", e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Insurance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Insurance Company</label>
            <input className={inputCls} placeholder="State Farm" value={claim.insuranceCompany} onChange={(e) => set("insuranceCompany", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Name</label>
            <input className={inputCls} placeholder="Jane Doe" value={claim.adjuster} onChange={(e) => set("adjuster", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Phone</label>
            <input className={inputCls} placeholder="(555) 000-0000" value={claim.adjusterPhone} onChange={(e) => set("adjusterPhone", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Email</label>
            <input className={inputCls} placeholder="adjuster@insurer.com" value={claim.adjusterEmail} onChange={(e) => set("adjusterEmail", e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Vehicle</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>VIN</label>
            <div className="flex gap-2">
              <input
                className={cn(inputCls, "flex-1 font-mono uppercase")}
                placeholder="17-character VIN"
                maxLength={17}
                value={claim.vin}
                onChange={(e) => set("vin", e.target.value.toUpperCase())}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onDecodeVin}
                disabled={claim.vin.length !== 17 || decoding}
                className="border-gray-200 text-gray-700 hover:bg-gray-100 shrink-0"
              >
                {decoding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Decode"}
              </Button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Year</label>
            <input className={inputCls} placeholder="2024" value={claim.year} onChange={(e) => set("year", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Make</label>
            <input className={inputCls} placeholder="Toyota" value={claim.make} onChange={(e) => set("make", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <input className={inputCls} placeholder="Camry" value={claim.model} onChange={(e) => set("model", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView({ entries, onView, onDelete, onNewComparison }: {
  entries: EstimateHistoryEntry[];
  onView: (entry: EstimateHistoryEntry) => void;
  onDelete: (id: string) => void;
  onNewComparison: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = searchQuery.trim()
    ? entries.filter(e => {
        const q = searchQuery.toLowerCase().trim();
        const v = e.vehicle;
        const c = e.claim;
        return (
          (c?.maNumber ?? "").toLowerCase().includes(q) ||
          (c?.claimNumber ?? "").toLowerCase().includes(q) ||
          (v?.vin ?? "").toLowerCase().includes(q) ||
          `${v?.year ?? ""} ${v?.make ?? ""} ${v?.model ?? ""}`.toLowerCase().includes(q) ||
          (c?.insuredName ?? "").toLowerCase().includes(q) ||
          (c?.insuranceCompany ?? "").toLowerCase().includes(q)
        );
      })
    : entries;

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "2-digit", day: "2-digit", year: "numeric",
    });
  }

  return (
    <div>
      {/* Tool card */}
      <div className="mb-8">
        <button onClick={onNewComparison} className="group w-full cursor-pointer">
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-6 text-center transition-all duration-200 group-hover:shadow-md group-hover:border-blue-400 group-hover:-translate-y-0.5">
            <h3 className="text-lg font-bold text-gray-900">Estimate Scan</h3>
            <p className="text-xs text-gray-400 mt-1">Upload & compare two estimates</p>
          </div>
        </button>
      </div>

      {/* Claims header + search */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Estimate Dispute Claims</h2>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search claims..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">MA #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Insured</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">VIN</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ins. Co.</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Delete</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-gray-400">
                  {searchQuery ? "No claims match your search." : "No claims yet."}
                </td>
              </tr>
            ) : (
              filtered.map((entry) => {
                const vehicle = entry.vehicle;
                const c = entry.claim;
                return (
                  <tr
                    key={entry.id}
                    onClick={() => onView(entry)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-900 font-medium">{c?.maNumber || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{c?.insuredName || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {vehicle?.year ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{vehicle?.vin || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-3 text-gray-700">{c?.insuranceCompany || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                        className="text-gray-300 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
import { Suspense } from "react";

function EstimateDisputePageInner() {
  const [claim, setClaim] = useState<EstimateClaimInfo>(defaultEstimateClaim);
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [entries, setEntries] = useState<EstimateHistoryEntry[]>([]);
  const [mode, setMode] = useState<"dashboard" | "compare">("dashboard");
  const [editing, setEditing] = useState(false);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    fetchEstimateHistory().then(setEntries);

    if (searchParams.get("from") === "history") {
      try {
        const raw = sessionStorage.getItem("modern-tools-prefill-result");
        if (raw) {
          setResult(JSON.parse(raw));
          sessionStorage.removeItem("modern-tools-prefill-result");
          setMode("compare");
        }
      } catch { /* ignore */ }
    }
  }, [searchParams]);

  const handleCompare = async () => {
    if (!fileA || !fileB) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const formData = new FormData();
    formData.append("estimateA", fileA);
    formData.append("estimateB", fileB);
    try {
      const res = await fetch("/api/compare-estimates", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Comparison failed");
      setResult(data);
      setEditing(false);
      await saveToHistory(data, claim, currentEntryId);
      const updated = await fetchEstimateHistory();
      setEntries(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setClaim(defaultEstimateClaim());
    setFileA(null); setFileB(null); setResult(null); setError(null);
    setEditing(false); setCurrentEntryId(null);
    if (entries.length > 0) setMode("dashboard");
  };

  const handleView = (entry: EstimateHistoryEntry) => {
    if (entry.claim) setClaim(entry.claim);
    setResult(entry.result);
    setCurrentEntryId(entry.id);
    setEditing(false);
    setMode("compare");
  };

  const handleDelete = async (id: string) => {
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    await deleteEstimateHistory(id);
    if (updated.length === 0) setMode("compare");
  };

  const handleEdit = () => {
    setEditing(true);
    setFileA(null);
    setFileB(null);
    setError(null);
  };

  const handleSaveResults = async (updated: ComparisonResult) => {
    setResult(updated);
    await saveToHistory(updated, claim, currentEntryId);
    const refreshed = await fetchEstimateHistory();
    setEntries(refreshed);
  };

  const handleSaveClaim = async () => {
    if (!result || !currentEntryId) return;
    await saveToHistory(result, claim, currentEntryId);
    const updated = await fetchEstimateHistory();
    setEntries(updated);
    setEditing(false);
  };

  // VIN decode
  const [decoding, setDecoding] = useState(false);
  const decodeVin = async () => {
    if (claim.vin.length !== 17) return;
    setDecoding(true);
    try {
      const res = await fetch(`/api/acv/decode-vin?vin=${claim.vin}`);
      const data = await res.json();
      if (res.ok) {
        setClaim(prev => ({
          ...prev,
          year: String(data.year ?? prev.year),
          make: data.make ?? prev.make,
          model: data.model ?? prev.model,
        }));
      }
    } catch { /* ignore */ }
    finally { setDecoding(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="no-print border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-white">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Negotiations</Link>
          </nav>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {mode === "dashboard" && !result ? (
          <DashboardView
            entries={entries}
            onView={handleView}
            onDelete={handleDelete}
            onNewComparison={() => { setClaim(defaultEstimateClaim()); setResult(null); setFileA(null); setFileB(null); setError(null); setEditing(false); setCurrentEntryId(null); setMode("compare"); }}
          />
        ) : result && !editing ? (
          <Results result={result} onReset={handleReset} onEdit={handleEdit} onSave={handleSaveResults} onBack={() => { setResult(null); setEditing(false); setCurrentEntryId(null); setMode("dashboard"); }} />
        ) : (
          <div className="max-w-3xl mx-auto">
            {!editing && entries.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setMode("dashboard")} className="mb-4 border-gray-200 text-gray-600 hover:bg-gray-100">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Claims
              </Button>
            )}
            {editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="mb-4 border-gray-200 text-gray-600 hover:bg-gray-100">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Results
              </Button>
            )}

            {/* Claim Info */}
            <Card className="bg-white border-gray-200 shadow-sm mb-6">
              <CardHeader>
                <CardTitle className="text-gray-900">Claim Information</CardTitle>
              </CardHeader>
              <CardContent>
                <ClaimInfoFormEstimate claim={claim} onChange={setClaim} decoding={decoding} onDecodeVin={decodeVin} />
              </CardContent>
            </Card>

            {/* Upload Estimates */}
            <Card className="bg-white border-gray-200 shadow-sm mb-6">
              <CardHeader>
                <CardTitle className="text-gray-900">{editing ? "Upload New Estimates" : "Upload Estimates"}</CardTitle>
                {editing && <p className="text-xs text-gray-400 mt-1">Upload new estimates to re-run the comparison, or just save your claim info changes below.</p>}
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <FileUploadZone label="Estimate A" file={fileA} onDrop={setFileA} onRemove={() => setFileA(null)} />
                <FileUploadZone label="Estimate B" file={fileB} onDrop={setFileB} onRemove={() => setFileB(null)} />
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                  </div>
                )}
                <Button onClick={handleCompare} disabled={!fileA || !fileB || loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium">
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing estimates...</> : "Compare Estimates"}
                </Button>
              </CardContent>
            </Card>

            {/* Save claim info only (when editing an existing entry) */}
            {editing && currentEntryId && (
              <Button onClick={handleSaveClaim} variant="outline" className="w-full border-gray-200 text-gray-700 hover:bg-gray-100">
                Save Claim Info Changes
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function EstimateDisputePage() {
  return (
    <Suspense>
      <EstimateDisputePageInner />
    </Suspense>
  );
}
