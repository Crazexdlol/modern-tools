"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import DOMPurify from "isomorphic-dompurify";
import {
  ClipboardList,
  User,
  Building2,
  Calendar,
  FileText,
  Scale,
  Plus,
  X,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Highlighter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SavedSummary,
  StatusEntry,
  StateLaw,
  DEFAULT_ADDITIONAL_INFO,
  genId,
} from "./lib";

/**
 * Editable Summary Page form. Shared between the standalone /summary-page/[id]
 * route and the inline "Summary Page" view inside the ACV Tools tab.
 * `resetKey` bumps to force the rich-text state-law fields to remount.
 */
export function SummaryFields({
  summary,
  onChange,
  resetKey = 0,
}: {
  summary: SavedSummary;
  onChange: (next: SavedSummary) => void;
  resetKey?: number;
}) {
  const [showInfoMenu, setShowInfoMenu] = useState(false);
  const [dragStatusIndex, setDragStatusIndex] = useState<number | null>(null);

  const update = <K extends keyof SavedSummary>(key: K, value: SavedSummary[K]) => {
    onChange({ ...summary, [key]: value });
  };

  // Status handlers
  const addStatus = () =>
    update("statuses", [...summary.statuses, { id: genId(), date: "", text: "" }]);
  const removeStatus = (sid: string) =>
    update("statuses", summary.statuses.filter((s) => s.id !== sid));
  const updateStatus = (sid: string, patch: Partial<StatusEntry>) =>
    update("statuses", summary.statuses.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const reorderStatuses = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...summary.statuses];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    update("statuses", next);
  };

  // Info handlers
  const addInfo = (text = "") =>
    update("additionalInfo", [...summary.additionalInfo, { id: genId(), text }]);
  const removeInfo = (iid: string) =>
    update("additionalInfo", summary.additionalInfo.filter((i) => i.id !== iid));
  const updateInfo = (iid: string, text: string) =>
    update("additionalInfo", summary.additionalInfo.map((i) => (i.id === iid ? { ...i, text } : i)));
  const moveInfo = (iid: string, dir: -1 | 1) => {
    const idx = summary.additionalInfo.findIndex((i) => i.id === iid);
    if (idx < 0) return;
    const next = [...summary.additionalInfo];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    update("additionalInfo", next);
  };

  // State law handlers
  const addStateLaw = () =>
    update("stateLaws", [...summary.stateLaws, { id: genId(), state: "", content: "" }]);
  const removeStateLaw = (lid: string) =>
    update("stateLaws", summary.stateLaws.filter((l) => l.id !== lid));
  const updateStateLaw = (lid: string, patch: Partial<StateLaw>) =>
    update("stateLaws", summary.stateLaws.map((l) => (l.id === lid ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-6">
      {/* Claim Identification */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-indigo-600" />
            <CardTitle className="text-sm font-medium text-gray-700">
              Claim Identification
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Date" type="date" value={summary.date} onChange={(v) => update("date", v)} />
            <Field label="Claim Number" value={summary.claimNumber} onChange={(v) => update("claimNumber", v)} placeholder="e.g. 26PAZ-00010386" />
            <Field label="Insurance Company" value={summary.insuranceCompany} onChange={(v) => update("insuranceCompany", v)} placeholder="e.g. First Chicago Ins. Co." />
            <Field label="Vehicle Owner" value={summary.vehicleOwner} onChange={(v) => update("vehicleOwner", v)} placeholder="First Last" />
            <Field label="Vehicle" value={summary.vehicle} onChange={(v) => update("vehicle", v)} placeholder="Year Make Model" />
            <Field label="Date of Loss" type="date" value={summary.dateOfLoss} onChange={(v) => update("dateOfLoss", v)} />
          </div>
        </CardContent>
      </Card>

      {/* OA Contact */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600" />
            <CardTitle className="text-sm font-medium text-gray-700">
              Opposing Appraiser (OA)
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Name" value={summary.opposingAppraiser} onChange={(v) => update("opposingAppraiser", v)} placeholder="First Last" />
            <Field label="Company" value={summary.oaCompany} onChange={(v) => update("oaCompany", v)} placeholder="Firm / appraisal company" icon={Building2} />
          </div>
        </CardContent>
      </Card>

      {/* Dates */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <CardTitle className="text-sm font-medium text-gray-700">
              Receipt & Initial Contact
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Date Received Claim" type="date" value={summary.dateReceivedClaim} onChange={(v) => update("dateReceivedClaim", v)} />
            <Field label="Initial Contact Date" type="date" value={summary.initialContactDate} onChange={(v) => update("initialContactDate", v)} />
            <Field label="Contacted Via" value={summary.initialContactVia} onChange={(v) => update("initialContactVia", v)} placeholder="email / phone / text" />
          </div>
        </CardContent>
      </Card>

      {/* Status Log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              <CardTitle className="text-sm font-medium text-gray-700">
                Status Log
              </CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={addStatus}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Status
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {summary.statuses.length === 0 && (
              <p className="text-xs text-gray-400 italic">No status entries yet.</p>
            )}
            {summary.statuses.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-start gap-2 group rounded-md transition-all ${
                  dragStatusIndex === i ? "opacity-40" : ""
                }`}
                onDragOver={(e) => { if (dragStatusIndex !== null) e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragStatusIndex !== null) reorderStatuses(dragStatusIndex, i);
                  setDragStatusIndex(null);
                }}
              >
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDragStatusIndex(i)}
                  onDragEnd={() => setDragStatusIndex(null)}
                  className="p-1.5 mt-0.5 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing shrink-0"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={s.date}
                  onChange={(e) => updateStatus(s.id, { date: e.target.value })}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shrink-0"
                />
                <input
                  type="text"
                  value={s.text}
                  onChange={(e) => updateStatus(s.id, { text: e.target.value })}
                  placeholder="What happened on this date..."
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
                />
                <button type="button" onClick={() => removeStatus(s.id)} className="p-1.5 mt-0.5 text-gray-400 hover:text-red-600 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" title="Remove">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Additional Claim Information */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <CardTitle className="text-sm font-medium text-gray-700">
                Additional Claim Information
              </CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowInfoMenu((v) => !v)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showInfoMenu && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50/60">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Suggestions</p>
                <button type="button" onClick={() => setShowInfoMenu(false)} className="text-gray-400 hover:text-gray-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {DEFAULT_ADDITIONAL_INFO.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => { addInfo(text); setShowInfoMenu(false); }}
                  className="block w-full text-left px-3 py-2.5 text-xs text-gray-700 hover:bg-white transition-colors border-b border-gray-100"
                >
                  {text}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { addInfo(); setShowInfoMenu(false); }}
                className="flex items-center gap-1.5 w-full text-left px-3 py-2.5 text-xs font-medium text-indigo-600 hover:bg-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Blank line
              </button>
            </div>
          )}
          <div className="space-y-2">
            {summary.additionalInfo.length === 0 && (
              <p className="text-xs text-gray-400 italic">No additional info yet.</p>
            )}
            {summary.additionalInfo.map((entry, i) => (
              <div key={entry.id} className="flex items-start gap-2 group">
                <span className="text-gray-400 pt-2 pl-1 select-none">•</span>
                <textarea
                  value={entry.text}
                  onChange={(e) => updateInfo(entry.id, e.target.value)}
                  rows={1}
                  placeholder="Additional claim detail..."
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400 resize-y min-h-[38px]"
                />
                <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => moveInfo(entry.id, -1)} disabled={i === 0} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed" title="Move up">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => moveInfo(entry.id, 1)} disabled={i === summary.additionalInfo.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed" title="Move down">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => removeInfo(entry.id)} className="p-1.5 text-gray-400 hover:text-red-600" title="Remove">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* State Laws */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-600" />
              <CardTitle className="text-sm font-medium text-gray-700">
                State Laws
              </CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={addStateLaw}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add State Law
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {summary.stateLaws.map((law) => (
              <div
                key={`${law.id}-${resetKey}`}
                className="border border-gray-200 rounded-md p-3 bg-gray-50/50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs font-medium text-gray-600">
                    State Law –
                  </label>
                  <input
                    type="text"
                    value={law.state}
                    onChange={(e) => updateStateLaw(law.id, { state: e.target.value.toUpperCase() })}
                    maxLength={4}
                    placeholder="PA"
                    className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <div className="ml-auto">
                    <button type="button" onClick={() => removeStateLaw(law.id)} className="p-1.5 text-gray-400 hover:text-red-600" title="Remove">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <RichField
                  initialHtml={law.content}
                  onChange={(html) => updateStateLaw(law.id, { content: html })}
                  placeholder="Paste or type the relevant state law / statute language. Select text and click the highlighter to mark key passages."
                  minHeight={140}
                />
              </div>
            ))}
            {summary.stateLaws.length === 0 && (
              <p className="text-xs text-gray-400 italic">No state laws added.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  icon?: typeof User;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 mb-1 block">{label}</span>
      <div className="relative">
        {Icon && (
          <Icon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-md border border-gray-300 bg-white py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400 ${
            Icon ? "pl-9 pr-3" : "px-3"
          }`}
        />
      </div>
    </label>
  );
}

function RichField({
  initialHtml,
  onChange,
  placeholder,
  minHeight = 120,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!initialHtml);

  useEffect(() => {
    if (ref.current) {
      // Sanitize existing content too — older rows may predate the
      // save-side sanitization added below.
      ref.current.innerHTML = DOMPurify.sanitize(initialHtml || "");
      setIsEmpty(!ref.current.textContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    if (!ref.current) return;
    // Sanitize on save so stored HTML is always clean. Print-side render
    // also sanitizes as a belt-and-suspenders check.
    onChange(DOMPurify.sanitize(ref.current.innerHTML));
    setIsEmpty(!ref.current.textContent);
  }, [onChange]);

  const applyHighlight = (color: string | null) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current) return;
    if (!ref.current.contains(sel.anchorNode)) return;
    if (color) {
      document.execCommand("hiliteColor", false, color);
    } else {
      document.execCommand("hiliteColor", false, "transparent");
      document.execCommand("removeFormat", false);
    }
    emit();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1 mb-1.5">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            applyHighlight("#fef08a");
          }}
          className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-yellow-50 hover:border-yellow-400"
          title="Highlight selected text"
        >
          <Highlighter className="w-3.5 h-3.5 text-yellow-600" />
          Highlight
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            applyHighlight(null);
          }}
          className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          title="Remove highlight from selection"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
        <span className="text-[11px] text-gray-400 ml-1">
          Select text, then click Highlight
        </span>
      </div>
      <div className="relative">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          style={{ minHeight }}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent whitespace-pre-wrap"
        />
        {isEmpty && placeholder && (
          <span className="absolute top-2 left-3 text-sm text-gray-400 pointer-events-none select-none">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}
