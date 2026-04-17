"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ClipboardList,
  Calendar,
  User,
  Phone,
  Mail,
  Building2,
  FileText,
  Scale,
  Save,
  Printer,
  Trash2,
  Check,
  Plus,
  X,
  Highlighter,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatusEntry = { id: string; date: string; text: string };
type InfoEntry = { id: string; text: string };
type StateLaw = { id: string; state: string; content: string };

type SummaryForm = {
  date: string;
  claimNumber: string;
  insuranceCompany: string;
  vehicleOwner: string;
  vehicle: string;
  dateOfLoss: string;
  opposingAppraiser: string;
  oaCompany: string;
  oaPhone: string;
  oaEmail: string;
  oaPreferredContact: string;
  dateReceivedClaim: string;
  initialContactDate: string;
  initialContactVia: string;
  statuses: StatusEntry[];
  additionalInfo: InfoEntry[];
  stateLaws: StateLaw[];
  updatedAt: string;
};

const STORAGE_KEY = "modern-tools-summary-page";

const genId = () => Math.random().toString(36).slice(2, 10);

const EMPTY: SummaryForm = {
  date: "",
  claimNumber: "",
  insuranceCompany: "",
  vehicleOwner: "",
  vehicle: "",
  dateOfLoss: "",
  opposingAppraiser: "",
  oaCompany: "",
  oaPhone: "",
  oaEmail: "",
  oaPreferredContact: "",
  dateReceivedClaim: "",
  initialContactDate: "",
  initialContactVia: "email",
  statuses: [{ id: genId(), date: "", text: "" }],
  additionalInfo: [{ id: genId(), text: "" }],
  stateLaws: [{ id: genId(), state: "", content: "" }],
  updatedAt: "",
};

export default function SummaryPagePage() {
  const [form, setForm] = useState<SummaryForm>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setForm({ ...EMPTY, ...parsed });
        setResetKey((k) => k + 1);
      }
    } catch {
      // ignore
    }
  }, []);

  const update = <K extends keyof SummaryForm>(key: K, value: SummaryForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const next = { ...form, updatedAt: new Date().toISOString() };
    setForm(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleClear = () => {
    if (!confirm("Clear the entire summary page? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    setForm({
      ...EMPTY,
      statuses: [{ id: genId(), date: "", text: "" }],
      additionalInfo: [{ id: genId(), text: "" }],
      stateLaws: [{ id: genId(), state: "", content: "" }],
    });
    setResetKey((k) => k + 1);
  };

  const handlePrint = () => window.print();

  // Status handlers
  const addStatus = () =>
    update("statuses", [...form.statuses, { id: genId(), date: "", text: "" }]);
  const removeStatus = (id: string) =>
    update(
      "statuses",
      form.statuses.filter((s) => s.id !== id)
    );
  const updateStatus = (id: string, patch: Partial<StatusEntry>) =>
    update(
      "statuses",
      form.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  const moveStatus = (id: string, dir: -1 | 1) => {
    const idx = form.statuses.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = [...form.statuses];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    update("statuses", next);
  };

  // Info handlers
  const addInfo = () =>
    update("additionalInfo", [...form.additionalInfo, { id: genId(), text: "" }]);
  const removeInfo = (id: string) =>
    update(
      "additionalInfo",
      form.additionalInfo.filter((i) => i.id !== id)
    );
  const updateInfo = (id: string, text: string) =>
    update(
      "additionalInfo",
      form.additionalInfo.map((i) => (i.id === id ? { ...i, text } : i))
    );
  const moveInfo = (id: string, dir: -1 | 1) => {
    const idx = form.additionalInfo.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const next = [...form.additionalInfo];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    update("additionalInfo", next);
  };

  // State law handlers
  const addStateLaw = () =>
    update("stateLaws", [...form.stateLaws, { id: genId(), state: "", content: "" }]);
  const removeStateLaw = (id: string) =>
    update(
      "stateLaws",
      form.stateLaws.filter((l) => l.id !== id)
    );
  const updateStateLaw = (id: string, patch: Partial<StateLaw>) =>
    update(
      "stateLaws",
      form.stateLaws.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="Modern Appraisers"
              width={160}
              height={48}
              className="h-9 w-auto"
              priority
            />
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Negotiations</Link>
            <Link href="/summary-page" className="text-sm font-medium text-white">Summary Page</Link>
          </nav>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 print:py-4">
        <div className="flex items-center gap-4 mb-6 print:hidden">
          <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Summary Page</h1>
            <p className="text-sm text-gray-500">
              Claim identification, status log, additional info, and state laws
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1.5" /> Print
            </Button>
            <Button variant="outline" onClick={handleClear}>
              <Trash2 className="w-4 h-4 mr-1.5" /> Clear
            </Button>
            <Button
              onClick={handleSave}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" /> Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" /> Save
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">Summary Page</h1>
          {form.updatedAt && (
            <p className="text-xs text-gray-500">
              Last updated: {new Date(form.updatedAt).toLocaleString()}
            </p>
          )}
        </div>

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
                <Field
                  label="Date"
                  type="date"
                  value={form.date}
                  onChange={(v) => update("date", v)}
                />
                <Field
                  label="Claim Number"
                  value={form.claimNumber}
                  onChange={(v) => update("claimNumber", v)}
                  placeholder="e.g. 26PAZ-00010386"
                />
                <Field
                  label="Insurance Company"
                  value={form.insuranceCompany}
                  onChange={(v) => update("insuranceCompany", v)}
                  placeholder="e.g. First Chicago Ins. Co."
                />
                <Field
                  label="Vehicle Owner"
                  value={form.vehicleOwner}
                  onChange={(v) => update("vehicleOwner", v)}
                  placeholder="First Last"
                />
                <Field
                  label="Vehicle"
                  value={form.vehicle}
                  onChange={(v) => update("vehicle", v)}
                  placeholder="Year Make Model"
                />
                <Field
                  label="Date of Loss"
                  type="date"
                  value={form.dateOfLoss}
                  onChange={(v) => update("dateOfLoss", v)}
                />
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
                <Field
                  label="Name"
                  value={form.opposingAppraiser}
                  onChange={(v) => update("opposingAppraiser", v)}
                  placeholder="First Last"
                />
                <Field
                  label="Company"
                  value={form.oaCompany}
                  onChange={(v) => update("oaCompany", v)}
                  placeholder="Firm / appraisal company"
                  icon={Building2}
                />
                <Field
                  label="Phone"
                  type="tel"
                  value={form.oaPhone}
                  onChange={(v) => update("oaPhone", v)}
                  placeholder="(555) 555-5555"
                  icon={Phone}
                />
                <Field
                  label="Email"
                  type="email"
                  value={form.oaEmail}
                  onChange={(v) => update("oaEmail", v)}
                  placeholder="name@example.com"
                  icon={Mail}
                />
                <div className="md:col-span-2">
                  <Field
                    label="Preferred Contact Method / Notes"
                    value={form.oaPreferredContact}
                    onChange={(v) => update("oaPreferredContact", v)}
                    placeholder="e.g. Prefers email before 5pm, cell for urgent"
                  />
                </div>
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
                <Field
                  label="Date Received Claim"
                  type="date"
                  value={form.dateReceivedClaim}
                  onChange={(v) => update("dateReceivedClaim", v)}
                />
                <Field
                  label="Initial Contact Date"
                  type="date"
                  value={form.initialContactDate}
                  onChange={(v) => update("initialContactDate", v)}
                />
                <Field
                  label="Contacted Via"
                  value={form.initialContactVia}
                  onChange={(v) => update("initialContactVia", v)}
                  placeholder="email / phone / text"
                />
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addStatus}
                  className="print:hidden"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Status
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {form.statuses.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No status entries yet.</p>
                )}
                {form.statuses.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-start gap-2 group"
                  >
                    <span className="text-xs font-medium text-gray-500 pt-2 w-16 shrink-0 print:w-auto print:pr-2">
                      Status:
                    </span>
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
                    <div className="flex items-center gap-0.5 print:hidden opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => moveStatus(s.id, -1)}
                        disabled={i === 0}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStatus(s.id, 1)}
                        disabled={i === form.statuses.length - 1}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStatus(s.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addInfo}
                  className="print:hidden"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {form.additionalInfo.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No additional info yet.</p>
                )}
                {form.additionalInfo.map((entry, i) => (
                  <div key={entry.id} className="flex items-start gap-2 group">
                    <span className="text-gray-400 pt-2 pl-1 select-none">•</span>
                    <textarea
                      value={entry.text}
                      onChange={(e) => updateInfo(entry.id, e.target.value)}
                      rows={1}
                      placeholder="Additional claim detail..."
                      className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400 resize-y min-h-[38px]"
                    />
                    <div className="flex items-center gap-0.5 print:hidden opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => moveInfo(entry.id, -1)}
                        disabled={i === 0}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveInfo(entry.id, 1)}
                        disabled={i === form.additionalInfo.length - 1}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeInfo(entry.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        title="Remove"
                      >
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addStateLaw}
                  className="print:hidden"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add State Law
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {form.stateLaws.map((law) => (
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
                        onChange={(e) =>
                          updateStateLaw(law.id, { state: e.target.value.toUpperCase() })
                        }
                        maxLength={4}
                        placeholder="PA"
                        className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <div className="ml-auto print:hidden">
                        <button
                          type="button"
                          onClick={() => removeStateLaw(law.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                          title="Remove"
                        >
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
                {form.stateLaws.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No state laws added.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {form.updatedAt && (
            <p className="text-xs text-gray-400 text-right print:hidden">
              Last saved: {new Date(form.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </main>
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
      ref.current.innerHTML = initialHtml || "";
      setIsEmpty(!ref.current.textContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    if (!ref.current) return;
    onChange(ref.current.innerHTML);
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
      // Also strip any <mark> / span backgrounds in selection
      document.execCommand("removeFormat", false);
    }
    emit();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1 mb-1.5 print:hidden">
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
