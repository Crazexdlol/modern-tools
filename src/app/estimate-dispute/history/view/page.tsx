"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { HistoryEntry } from "../../page";

export default function HistoryViewPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("modern-tools-history-view");
      if (!raw) { router.replace("/estimate-dispute"); return; }
      const entry: HistoryEntry = JSON.parse(raw);
      sessionStorage.setItem("modern-tools-prefill-result", JSON.stringify(entry.result));
      router.replace("/estimate-dispute?from=history");
    } catch {
      router.replace("/estimate-dispute");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Loading comparison...</p>
    </div>
  );
}
