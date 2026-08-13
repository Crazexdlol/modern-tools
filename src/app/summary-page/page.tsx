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

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await deleteSummary(id);
    setSummaries(await listSummaries());
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Summary Pages</h1>
            <p className="text-sm text-gray-500">
              All saved claim summaries. Click one to edit, or start a new summary.
            </p>
          </div>
          <Button
            onClick={handleNew}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Summary
          </Button>
        </div>

        {loaded && summaries.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-4">
                No summaries saved yet.
              </p>
              <Button
                onClick={handleNew}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Create your first summary
              </Button>
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
                          handleDelete(s.id, title);
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
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}
