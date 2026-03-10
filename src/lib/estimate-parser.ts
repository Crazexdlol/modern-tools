// Normalizes terminology across CCC ONE, Mitchell, Audatex, Web-Est, Estimating Edge

export interface EstimateLineItem {
  category: string;         // e.g. "Labor", "Parts", "Paint", "Sublet", "Other"
  operation: string;        // normalized operation name
  rawOperation: string;     // original text from estimate
  laborHours?: number;
  laborRate?: number;
  laborTotal?: number;
  partNumber?: string;
  partPrice?: number;
  quantity?: number;
  total?: number;
  notes?: string;
}

export interface ParsedEstimate {
  software?: string;        // detected software (CCC, Mitchell, Audatex, Web-Est, Estimating Edge)
  vehicleInfo?: {
    year?: string;
    make?: string;
    model?: string;
    vin?: string;
    color?: string;
    mileage?: string;
  };
  shopInfo?: {
    name?: string;
    address?: string;
  };
  totals?: {
    laborTotal?: number;
    partsTotal?: number;
    paintTotal?: number;
    subletTotal?: number;
    taxTotal?: number;
    grandTotal?: number;
  };
  laborRates?: {
    body?: number;
    frame?: number;
    paint?: number;
    mechanical?: number;
    aluminum?: number;
  };
  lineItems: EstimateLineItem[];
  rawText: string;
}

// Terminology normalization maps for each software
const OPERATION_SYNONYMS: Record<string, string> = {
  // Labor types
  "r&r": "remove & replace",
  "r&i": "remove & install",
  "r/r": "remove & replace",
  "r/i": "remove & install",
  "repl": "replace",
  "replc": "replace",
  "rep": "replace",
  "ref": "refinish",
  "rfsh": "refinish",
  "refinish": "refinish",
  "blend": "blend",
  "blnd": "blend",
  "repair": "repair",
  "rep/rpr": "repair",
  "str": "straighten",
  "straighten": "straighten",
  "align": "align",
  "alignmt": "align",
  "o/h": "overhaul",
  "overhaul": "overhaul",
  // Parts categories
  "oem": "OEM part",
  "aft": "aftermarket part",
  "a/m": "aftermarket part",
  "lkq": "used/LKQ part",
  "used": "used/LKQ part",
  "recond": "reconditioned part",
  // Paint
  "clearcoat": "clear coat",
  "clear": "clear coat",
  "cc": "clear coat",
  "primer": "primer",
  "prm": "primer",
  "sealer": "sealer",
  "edgework": "edge work",
  "edge": "edge work",
  // Structural
  "uni": "unibody",
  "unibody": "unibody",
  "frame": "frame",
  "sectioning": "sectioning",
  "sect": "sectioning",
};

export function normalizeOperation(raw: string): string {
  const lower = raw.toLowerCase().trim();
  // Try direct match
  if (OPERATION_SYNONYMS[lower]) return OPERATION_SYNONYMS[lower];
  // Try partial match
  for (const [key, val] of Object.entries(OPERATION_SYNONYMS)) {
    if (lower.includes(key)) return val;
  }
  return raw.trim();
}

export function detectSoftware(text: string): string {
  const upper = text.toUpperCase();
  if (upper.includes("CCC ONE") || upper.includes("CCCONE") || upper.includes("CCC INFORMATION")) return "CCC ONE";
  if (upper.includes("MITCHELL") || upper.includes("ULTRAMATE") || upper.includes("MITCHELL CLOUD")) return "Mitchell";
  if (upper.includes("AUDATEX") || upper.includes("SOLERA") || upper.includes("QEST")) return "Audatex";
  if (upper.includes("WEB-EST") || upper.includes("WEBEST")) return "Web-Est";
  if (upper.includes("ESTIMATING EDGE") || upper.includes("PMC LOGIC")) return "Estimating Edge";
  return "Unknown";
}
