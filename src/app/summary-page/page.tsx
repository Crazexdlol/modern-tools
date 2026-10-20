"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  Plus,
  Trash2,
  Calendar,
  Car,
  User,
  Building2,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  SavedSummary,
  deleteSummary,
  genId,
  listSummaries,
  migrateLegacy,
  newEmptyForm,
  saveSummary,
  summaryTitle,
} from "./lib";

export default function SummaryDashboardPage() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<SavedSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    (async () => {
      await migrateLegacy();
      const rows = await listSummaries();
      setSummaries(rows);
      setLoaded(true);
    })();
  }, []);

  const handleNew = async () => {
    const id = genId();
    const now = new Date().toISOString();
    const fresh: SavedSummary = {
      ...newEmptyForm(),
      id,
      createdAt: now,
      updatedAt: now,
    };
    await saveSummary(fresh);
    router.push(`/summary-page/${id}`);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    await deleteSummary(id);
    setSummaries(await listSummaries());
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-6 py-7">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/" className="hp-btn hp-btn-sm hp-btn-ghost">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <h1 className="hp-display flex-1">Summary Pages</h1>
          <button onClick={handleNew} className="hp-btn hp-btn-primary">
            <Plus className="w-4 h-4" /> New Summary
          </button>
        </div>

        {loaded && summaries.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-4">
                No summaries saved yet.
              </p>
              <button onClick={handleNew} className="hp-btn hp-btn-primary mx-auto">
                <Plus className="w-4 h-4" /> Create your first summary
              </button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {summaries.map((s) => {
            const title = summaryTitle(s);
            return (
              <Link
                key={s.id}
                href={`/summary-page/${s.id}`}
                className="block group"
              >
                <Card className="transition-colors hover:border-indigo-300 hover:shadow-sm">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <ClipboardList className="w-4 h-4 text-indigo-600 shrink-0" />
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {title}
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 pl-6">
                          {s.insuranceCompany && (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="w-3 h-3 text-gray-400" />
                              {s.insuranceCompany}
                            </span>
                          )}
                          {s.vehicle && (
                            <span className="flex items-center gap-1.5">
                              <Car className="w-3 h-3 text-gray-400" />
                              {s.vehicle}
                            </span>
                          )}
                          {s.dateOfLoss && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              DOL: {formatDate(s.dateOfLoss)}
                            </span>
                          )}
                          {s.opposingAppraiser && (
                            <span className="flex items-center gap-1.5">
                              <User className="w-3 h-3 text-gray-400" />
                              OA: {s.opposingAppraiser}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2 pl-6 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>Last updated: {new Date(s.updatedAt).toLocaleString()}</span>
                          {s.creatorEmail && (
                            <span className="text-gray-500">
                              Created by: <span className="font-medium text-gray-600">{s.creatorEmail}</span>
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPendingDelete({ id: s.id, title });
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 opacity-60 group-hover:opacity-100 transition-opacity"
                        title="Delete summary"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this summary?"
        message={
          pendingDelete ? (
            <>Delete <b>&quot;{pendingDelete.title}&quot;</b>? This cannot be undone.</>
          ) : null
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}
