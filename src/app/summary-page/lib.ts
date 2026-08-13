import { createClient } from "@/lib/supabase/client";

export type StatusEntry = { id: string; date: string; text: string };
export type InfoEntry = { id: string; text: string };
export type StateLaw = { id: string; state: string; content: string };

export type SummaryForm = {
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
};

export type SavedSummary = SummaryForm & {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  creatorEmail?: string | null;
};

const LEGACY_SUMMARIES_KEY = "modern-tools-summaries";
const LEGACY_SINGLE_KEY = "modern-tools-summary-page";
const MIGRATED_FLAG = "modern-tools-summaries-migrated";

export const genId = () => Math.random().toString(36).slice(2, 10);

export const EMPTY_FORM: SummaryForm = {
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
  statuses: [],
  additionalInfo: [],
  stateLaws: [],
};

// Suggested Additional Claim Information lines. Offered as pick-list options
// when the user clicks "Add Line" — no longer pre-filled into new summaries.
export const DEFAULT_ADDITIONAL_INFO = [
  "No aftermarket parts were identified; therefore, no adjustments were applied",
  "Vehicle condition was evaluated based on available documentation and photos",
  "No UPD deductions were made as no UPD estimate was provided or identified",
];

export function newEmptyForm(): SummaryForm {
  return {
    ...EMPTY_FORM,
    statuses: [{ id: genId(), date: "", text: "" }],
    additionalInfo: [],
    stateLaws: [],
  };
}

function rowToSummary(row: Record<string, unknown>): SavedSummary {
  const data = (row.data as Partial<SummaryForm>) ?? {};
  return {
    ...EMPTY_FORM,
    ...data,
    statuses: data.statuses ?? [],
    additionalInfo: data.additionalInfo ?? [],
    stateLaws: data.stateLaws ?? [],
    id: row.id as string,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
    createdBy: (row.created_by as string) ?? null,
    creatorEmail: (row.creator_email as string) ?? null,
  };
}

function summaryToData(s: SavedSummary): SummaryForm {
  return {
    date: s.date,
    claimNumber: s.claimNumber,
    insuranceCompany: s.insuranceCompany,
    vehicleOwner: s.vehicleOwner,
    vehicle: s.vehicle,
    dateOfLoss: s.dateOfLoss,
    opposingAppraiser: s.opposingAppraiser,
    oaCompany: s.oaCompany,
    oaPhone: s.oaPhone,
    oaEmail: s.oaEmail,
    oaPreferredContact: s.oaPreferredContact,
    dateReceivedClaim: s.dateReceivedClaim,
    initialContactDate: s.initialContactDate,
    initialContactVia: s.initialContactVia,
    statuses: s.statuses,
    additionalInfo: s.additionalInfo,
    stateLaws: s.stateLaws,
  };
}

export async function listSummaries(): Promise<SavedSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("summaries")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch summaries:", error);
    return [];
  }
  return (data ?? []).map(rowToSummary);
}

export async function getSummary(id: string): Promise<SavedSummary | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("summaries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch summary:", error);
    return null;
  }
  return data ? rowToSummary(data) : null;
}

export async function saveSummary(summary: SavedSummary): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from("summaries").upsert({
    id: summary.id,
    created_by: summary.createdBy ?? user.id,
    creator_email: summary.creatorEmail ?? user.email ?? null,
    created_at: summary.createdAt || now,
    updated_at: now,
    data: summaryToData(summary),
  });
  if (error) console.error("Failed to save summary:", error);
}

export async function deleteSummary(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("summaries").delete().eq("id", id);
  if (error) console.error("Failed to delete summary:", error);
}

export async function migrateLegacy(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATED_FLAG) === "1") return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    // Migrate the multi-summary localStorage bucket
    const raw = localStorage.getItem(LEGACY_SUMMARIES_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, SavedSummary>;
      const rows = Object.values(all).map((s) => ({
        id: s.id,
        created_by: user.id,
        creator_email: user.email ?? null,
        created_at: s.createdAt || new Date().toISOString(),
        updated_at: s.updatedAt || new Date().toISOString(),
        data: summaryToData({ ...EMPTY_FORM, ...s }),
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("summaries").upsert(rows);
        if (error) {
          console.error("Summary migration error:", error);
          return;
        }
      }
      localStorage.removeItem(LEGACY_SUMMARIES_KEY);
    }

    // Migrate the older single-summary localStorage bucket (pre-multi)
    const singleRaw = localStorage.getItem(LEGACY_SINGLE_KEY);
    if (singleRaw) {
      const parsed = JSON.parse(singleRaw) as Partial<SummaryForm> & { updatedAt?: string };
      const id = genId();
      const now = new Date().toISOString();
      const merged: SavedSummary = {
        ...newEmptyForm(),
        ...parsed,
        id,
        createdAt: parsed.updatedAt || now,
        updatedAt: parsed.updatedAt || now,
      };
      await supabase.from("summaries").upsert({
        id,
        created_by: user.id,
        creator_email: user.email ?? null,
        created_at: merged.createdAt,
        updated_at: merged.updatedAt,
        data: summaryToData(merged),
      });
      localStorage.removeItem(LEGACY_SINGLE_KEY);
    }

    localStorage.setItem(MIGRATED_FLAG, "1");
  } catch (err) {
    console.error("Failed to migrate summaries:", err);
  }
}

export function summaryTitle(s: SavedSummary): string {
  const parts = [s.claimNumber, s.vehicleOwner].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Untitled Summary";
}
