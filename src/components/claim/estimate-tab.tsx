"use client";

// Estimate Dispute tab. Estimate Review is the only tool here now — Compare
// Two Estimates was removed 2026-09-12. Old claims with an `estimate.result`
// field from the retired Compare tool still deserialize fine; nothing reads
// those extra fields, so they sit inert on save.

import type { ClaimInfo } from "@/lib/acv/types";
import type { EstimateReview, LaborRateAssertion } from "@/lib/estimate-review/types";
import type { ClaimDocument } from "@/lib/supabase/documents";
import { EstimateReviewTab } from "./estimate-review-tab";

// Per-claim estimate dispute payload, stored on acv_history.estimate (jsonb)
// and persisted by the claim workspace auto-save.
export interface ClaimEstimate {
  savedAt: string;
  // Estimate Review results. Optional — undefined on claims that predate this feature.
  reviews?: EstimateReview[];
  // Appraiser-asserted labor rates (Phase 1). Persisted per-claim so re-runs
  // of Review Another Estimate keep the same asserted values by default.
  assertedLaborRates?: LaborRateAssertion[];
}

export function EstimateTab({
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
  onDocumentSaved?: (blob: Blob, name: string, source: ClaimDocument["source"]) => Promise<void> | void;
  documents: ClaimDocument[];
}) {
  return (
    <EstimateReviewTab
      claim={claim}
      claimId={claimId}
      estimate={estimate}
      onChange={onChange}
      onDocumentSaved={onDocumentSaved}
      documents={documents}
    />
  );
}
