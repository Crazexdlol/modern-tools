"use client";
import type { ClaimInfo } from "@/lib/acv/types";
import type { ClaimEstimate } from "./estimate-tab";

export function EstimateReviewTab({
  claim: _claim,
  estimate: _estimate,
  onChange: _onChange,
}: {
  claim: ClaimInfo;
  estimate: ClaimEstimate | null;
  onChange: (next: ClaimEstimate) => void;
}) {
  return (
    <div className="p-8 text-center text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
      Estimate Review — coming up in the next task.
    </div>
  );
}
