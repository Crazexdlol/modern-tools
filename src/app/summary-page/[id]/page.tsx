"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Save,
  Printer,
  Trash2,
  Check,
  ChevronLeft,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SummaryFields } from "../SummaryFields";
import { SummaryPrintDoc } from "../SummaryPrintDoc";
import {
  SavedSummary,
  deleteSummary,
  getSummary,
  newEmptyForm,
  saveSummary,
} from "../lib";

export default function SummaryEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [summary, setSummary] = useState<SavedSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  // "Back" returns to wherever this summary was opened from (e.g. the ACV Tools
  // tab that created it, restored via the comp-finder draft), else the ACV list.
  const [backHref] = useState(() =>
    typeof window === "undefined"
      ? "/acv"
      : new URLSearchParams(window.location.search).get("from") || "/acv"
  );

  useEffect(() => {
    (async () => {
      const existing = await getSummary(id);
      if (existing) {
        setSummary(existing);
        setResetKey((k) => k + 1);
      } else {
        setNotFound(true);
      }
    })();
  }, [id]);

  // Auto-save every edit (debounced) so nothing is lost on leaving the page.
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSave = useRef(true);
  useEffect(() => {
    if (!summary) return;
    // Skip the first run (initial load populating state).
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveSummary({ ...summary, updatedAt: new Date().toISOString() });
    }, 700);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [summary]);

  const handleSave = async () => {
    if (!summary) return;
    const next = { ...summary, updatedAt: new Date().toISOString() };
    setSummary(next);
    await saveSummary(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleDelete = () => setConfirmingDelete(true);
  const confirmDelete = async () => {
    if (!summary) return;
    setConfirmingDelete(false);
    await deleteSummary(summary.id);
    router.push("/summary-page");
  };

  const handleClear = () => setConfirmingClear(true);
  const confirmClear = async () => {
    if (!summary) return;
    setConfirmingClear(false);
    const cleared: SavedSummary = {
      ...newEmptyForm(),
      id: summary.id,
      createdAt: summary.createdAt,
      updatedAt: new Date().toISOString(),
      createdBy: summary.createdBy,
      creatorEmail: summary.creatorEmail,
    };
    setSummary(cleared);
    await saveSummary(cleared);
    setResetKey((k) => k + 1);
  };

  const handlePrint = () => window.print();

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Summary not found.</p>
          <Link
            href="/acv"
            className="text-indigo-600 hover:underline text-sm"
          >
            Back to ACV
          </Link>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="summary-root min-h-screen bg-gray-50 text-gray-900">
      {/* Screen header */}
      <AppHeader />

      {/* Screen form */}
      <main className="screen-only max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => router.push(backHref)} className="border-gray-200 text-gray-700 hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
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
              variant="outline"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete
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

        <div className="space-y-6">
          <SummaryFields summary={summary} onChange={setSummary} resetKey={resetKey} />

          {summary.updatedAt && (
            <p className="text-xs text-gray-400 text-right">
              Last saved: {new Date(summary.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </main>

      {/* Print layout — mirrors the Modern Appraiser Summary Page.docx.
          Shared with the summary list so both surfaces print identically. */}
      <SummaryPrintDoc summary={summary} />

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this summary?"
        message="This will permanently delete this summary. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
      <ConfirmDialog
        open={confirmingClear}
        title="Clear all fields?"
        message="This will clear every field on this summary. The saved record stays but all content is wiped. This cannot be undone."
        confirmLabel="Clear"
        variant="danger"
        onConfirm={confirmClear}
        onCancel={() => setConfirmingClear(false)}
      />
    </div>
  );
}
