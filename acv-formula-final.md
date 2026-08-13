# Defensible ACV Formula — Modern Appraisers Standard Model

**Version:** 2.0 (Approved)
**Status:** Approved by auto-claims-appraisal-expert; suitable for production use in appraisal-clause disputes
**Maintainer:** Modern Appraisers (Henry Aleksanyan)
**Effective:** 2026-05-21

---

## 1. Title + Version + Status

| Field | Value |
|---|---|
| Title | Defensible ACV Formula — Modern Appraisers Standard Model |
| Version | 2.0 |
| Status | Approved (production) |
| Approval | auto-claims-appraisal-expert (sign-off) |
| Use Case | First-party total loss disputes, appraisal-clause proceedings, umpire submissions |
| Rebuttal Surface | CCC ONE Market Valuation Report, Mitchell WorkCenter Total Loss, Audatex Autosource |

---

## 2. Executive Summary

The Modern Appraisers Standard Model is a 10-stage, four-family deterministic valuation engine that converts a subject vehicle, a comparable-set of retail offerings, and a documented market context into an Actual Cash Value (ACV) figure with an associated confidence interval, an audit trail, and a settlement breakdown ready for direct submission in an appraisal-clause dispute.

It exists because the dominant insurer-side valuation platforms (CCC ONE, Mitchell, Audatex) systematically depress ACV through three identifiable mechanisms: (a) flat, undocumented "Projected Sold Adjustments" (PSA) applied across comparables, (b) defaulting every condition category to "Normal" regardless of evidence, and (c) silent suppression of high comps without disclosure. Every stage of this model produces an auditable rebuttal to one or more of those mechanisms.

The headline outputs are: (1) a **point estimate** ACV; (2) a **range** [P25, P75] expressed in dollars; (3) a **confidence score** (Low/Medium/High) derived from comp dispersion and data completeness; (4) a structured **audit callout list** identifying every adjustment and its source; and (5) a **settlement breakdown** showing pre-tax ACV, sales tax, statutory fees, deductible, lien payoff, and net check to insured.

It is used by Modern Appraisers staff and is designed to be portable to a spreadsheet, a Postgres-backed Next.js tool, or a structured PDF report. Output is consumable by attorneys, umpires, and unrepresented vehicle owners alike.

---

## 3. Methodology Overview

### Pipeline (10 Stages)

| # | Stage | One-Line Description |
|---|---|---|
| 1 | Comp Normalization | Adjust each comparable sequentially to subject-equivalent state |
| 2 | Comp Weighting | Assign weights by similarity score with a 4:1 max ratio clamp |
| 3 | Base Value Synthesis | Compute weighted base, then apply CIR-based condition delta |
| 4 | Structural Multipliers | Apply title, use-history, and like-brand guard multipliers |
| 5 | Market Drift | Adjust for elapsed time between comp pull date and loss date |
| 6 | Book Anchor Reconciliation | Sanity-check against KBB / NADA / Black Book bands |
| 7 | Add-Backs & Statutory | Sales tax, title, registration, doc fees, deductible |
| 8 | Side-Block: LOU / PP / DV | Optional loss-of-use, personal property, diminished value |
| 9 | Lien / Gap Settlement | Lien payoff, gap insurance, equity routing |
| 10 | Output Assembly | Point estimate, range, confidence, callouts, JSON envelope |

### Variable Families

- **S-series** — Subject vehicle (VIN-decoded + owner-attested + inspection)
- **C-series** — Comparable vehicles (LIVE market pulls)
- **M-series** — Market / methodology constants (PSA mode, drift rate, anchors)
- **R-series** — Report posture (owner-side R1–R7, insurer-side R8–R17)

### Side-Blocks

- **A-series** — Add-backs and deductions
- **AP-series** — Appraisal-clause procedural variables
- **L-series** — Lien and gap
- **LOU / PP / DV** — Loss-of-use, personal property, diminished value
- **T-series** — Boolean and enum toggles

---

## 4. Variable Registry — Full

### 4.1 S-Series (Subject Vehicle)

| Variable | Type | Source | Units | Meaning |
|---|---|---|---|---|
| S.VIN | string | OWNER | — | 17-char VIN |
| S.Year | int | STATIC (VIN decode) | year | Model year |
| S.Make | string | STATIC | — | Manufacturer |
| S.Model | string | STATIC | — | Model line |
| S.Trim | string | STATIC | — | Trim level |
| S.Engine | string | STATIC | — | Powertrain code |
| S.Drivetrain | enum | STATIC | FWD/RWD/AWD/4WD | — |
| S.Mileage | int | INSPECTION | mi | Odometer at loss |
| S.OdoStatus | enum | OWNER | Actual/Exceeds/NotActual | Title brand on odo |
| S.TitleBrand | enum | LIVE (NMVTIS) | Clean/Salvage/Rebuilt/Flood | — |
| S.PriorDamage | bool | LIVE (CARFAX/AutoCheck) | — | Pre-loss damage record |
| S.UseType | enum | OWNER | Personal/Commercial/Livery/Rental | — |
| S.GarageZip | string | OWNER | ZIP5 | Garaging location |
| S.LossDate | date | OWNER | ISO | Date of loss |
| S.Options[] | array | INSPECTION + S.WindowStickerOnFile | — | Factory option codes |
| S.WindowStickerOnFile | bool | OWNER | — | Monroney available for option verification |
| S.CIR[k] | enum | INSPECTION | BelowAvg/Avg/Above/Excellent | Condition rating per category k ∈ {Tires, Paint, Body, Glass, Interior, Mechanical, Electronics, Frame} |
| S.RecentService[] | array | OWNER | — | Documented services in last 12 mo |
| S.SalvageRetention | bool | OWNER | — | Insured keeps wreck |

### 4.2 C-Series (Comparables)

| Variable | Type | Source | Units | Meaning |
|---|---|---|---|---|
| C[i].Source | enum | LIVE | Dealer/Auction/Private | Listing channel |
| C[i].Channel | enum | LIVE | Retail/Wholesale | Pricing tier |
| C[i].Price | float | LIVE | USD | List price |
| C[i].PriceType | enum | LIVE | Asking/Sold | — |
| C[i].Mileage | int | LIVE | mi | Comp odometer |
| C[i].Distance | float | LIVE | mi | From S.GarageZip |
| C[i].Trim | string | LIVE | — | Comp trim |
| C[i].Options[] | array | LIVE | — | Comp options |
| C[i].CIREquivalent | enum | LIVE (photo audit) | — | Inferred condition |
| C[i].DaysListed | int | LIVE | days | Time on market |
| C[i].Suppressed | bool | DERIVED | — | Excluded from set, w/ reason |
| C[i].SuppressionReason | enum | DERIVED | OutOfTrim/OutOfRange/Stale/Salvage/Duplicate | — |

### 4.3 M-Series (Market / Methodology)

| Variable | Type | Source | Units | Meaning |
|---|---|---|---|---|
| M.PSA_Mode | enum | T-series | None/Documented/Insurer | PSA application policy |
| M.PSA_Pct | float | LIVE (negotiated transactions study) | % | When Documented, segment-specific PSA |
| M.MileageRate | float | LIVE (MileageRateTable) | USD/mi | Per-segment mileage cost |
| M.BookAnchor_KBB | float | LIVE (KBB API) | USD | KBB Private Party / Typical Listing |
| M.BookAnchor_NADA | float | LIVE (JD Power) | USD | NADA Clean Retail |
| M.BookAnchor_BB | float | LIVE (Black Book) | USD | Black Book Retail |
| M.Drift_Pct_PerMonth | float | LIVE (segment index) | %/mo | Market drift rate |
| M.PullDate | date | LIVE | ISO | Date comps were pulled |
| M.SegmentClass | enum | STATIC | Compact/Mid/Full/Luxury/Truck/SUV/EV | Used for rate selection |

### 4.4 R-Series (Report Posture)

**Owner-side (R1–R7):**

| Variable | Meaning |
|---|---|
| R1 | Comp count target (default 5) |
| R2 | Geographic radius cap (mi) |
| R3 | Condition evidence threshold (photos/receipts required) |
| R4 | Trim-match strictness (exact / adjacent / family) |
| R5 | Option-match threshold (% of MSRP-weighted options matched) |
| R6 | Drift application policy |
| R7 | Range methodology (P25/P75 vs ±1σ) |

**Insurer-side (R8–R17):**

| Variable | Meaning |
|---|---|
| R8 | PSA disclosure flag (was PSA disclosed in carrier report?) |
| R9 | PSA magnitude observed in carrier report |
| R10 | Carrier condition default (typically "Normal") |
| R11 | Carrier comp suppression count |
| R12 | Carrier dealer-vs-private mix |
| R13 | Carrier radius used |
| R14 | Carrier mileage adjustment per mi |
| R15 | Carrier trim-mismatch handling |
| R16 | Carrier report platform (CCC/Mitchell/Audatex) |
| R17 | Carrier offer ACV (insurer-stated) |

### 4.5 A-Series (Add-Backs / Deductions)

| Variable | Type | Source | Meaning |
|---|---|---|---|
| A.SalesTaxRule | enum | STATIC (state) | PaidAtSettlement / ReplacementProof / NotOwed |
| A.SalesTaxRate | float | STATIC (state/local) | Combined tax rate |
| A.TitleFee | float | STATIC | State title issuance fee |
| A.RegFee | float | STATIC | Pro-rated registration |
| A.DocFee | float | STATIC | Where statutorily owed |
| A.Deductible | float | LIVE (policy) | Per policy declarations |
| A.SalvageRetentionValue | float | LIVE (Copart/IAA) | If S.SalvageRetention=true, deducted |

### 4.6 AP-Series (Appraisal-Clause Procedural)

| Variable | Meaning |
|---|---|
| AP1 | Demand-for-appraisal date |
| AP2 | Insurer appraiser identity |
| AP3 | Owner appraiser identity |
| AP4 | Umpire selected (Y/N + name) |
| AP5 | Statement-of-loss exchanged |
| AP6 | Inspection scheduled |
| AP7 | Award form template |
| AP8 | Award binding scope (ACV only vs. all coverages) |
| AP9 | Cost split rule (50/50 default) |
| AP10 | Discovery permitted under state rule |
| AP11 | Time limit per policy |
| AP12 | Deductible application rule (state-specific) |
| AP13 | Sales tax application rule (state-specific) |

### 4.7 L-Series (Lien / Gap)

| Variable | Meaning |
|---|---|
| L.LienholderName | Bank/credit union |
| L.PayoffAmount | 10-day payoff |
| L.PayoffGoodThrough | Date |
| L.GapPolicyExists | Bool |
| L.GapCarrier | — |
| L.EquityRouting | OwnerCheck / LienholderPriority |

### 4.8 LOU / PP / DV

| Variable | Block | Meaning |
|---|---|---|
| LOU.DailyRate | LOU | Market rental rate for class |
| LOU.Days | LOU | Days from loss to settlement |
| LOU.PolicyCap | LOU | Policy per-day / aggregate cap |
| PP.Items[] | PP | Personal property in vehicle |
| PP.SubLimit | PP | Coverage sub-limit |
| DV.Eligible | DV | Third-party only (usually) |
| DV.PreLossACV | DV | Pre-loss market value |
| DV.PostRepairACV | DV | Post-repair market value |
| DV.Method | DV | 17c / Modified 17c / Market Survey |

### 4.9 T-Series (Toggles)

| Toggle | Default | Behavior |
|---|---|---|
| T.ApplyPSA | false | When true, applies M.PSA_Pct (Documented mode only) |
| T.ApplyDrift | true | Applies M.Drift_Pct_PerMonth |
| T.LikeBrandGuard | true | Suppresses salvage/branded comps if subject is clean |
| T.StrictTrim | true | Requires exact trim match unless overridden |
| T.UseBookAnchor | true | Engages Stage 6 reconciliation |
| T.IncludeLOU | false | Only when policy and facts support |
| T.IncludePP | false | Only when claimed |
| T.IncludeDV | false | First-party usually excluded |
| T.SuppressionAudit | true | Always log suppressed comps with reason |

---

## 5. Formula Stages — Full Math

### Stage 1 — Comp Normalization (sequential)

For each comparable i ∈ {1..N}:

```
C[i].Adj0 = C[i].Price

# 1a Mileage
C[i].Adj1 = C[i].Adj0 + (C[i].Mileage − S.Mileage) × M.MileageRate

# 1b Trim
C[i].Adj2 = C[i].Adj1 + TrimDelta(S.Trim, C[i].Trim)

# 1c Options
C[i].Adj3 = C[i].Adj2 + Σ_o (OptionValue_o · 1[o ∈ S.Options] − OptionValue_o · 1[o ∈ C[i].Options])

# 1d Condition (comp-equivalent → subject-equivalent baseline, set to neutral here; condition applied in Stage 3)
C[i].Adj4 = C[i].Adj3

# 1e PSA (only if T.ApplyPSA AND M.PSA_Mode = Documented)
C[i].AdjFinal = C[i].Adj4 × (1 − M.PSA_Pct)   if T.ApplyPSA, else C[i].Adj4
```

**Suppression filter (applied before Stage 2):**
```
Suppress if any of:
  - C[i].Trim ∉ AllowedTrimSet(S.Trim, R4)
  - C[i].Distance > R2
  - C[i].Mileage ∉ [S.Mileage − Δmi_low, S.Mileage + Δmi_high]
  - C[i].TitleBrand ≠ Clean AND T.LikeBrandGuard AND S.TitleBrand = Clean
  - C[i].DaysListed > StaleThreshold
```

### Stage 2 — Comp Weighting

```
SimScore[i] = w_trim·TrimMatch[i]
            + w_opt ·OptionMatch[i]
            + w_mi  ·(1 − |C[i].Mileage − S.Mileage| / MileageBand)
            + w_geo ·(1 − C[i].Distance / R2)
            + w_chan·ChannelMatch[i]

W_raw[i] = SimScore[i]^γ           (γ = 2 default)

# 4:1 clamp
W_clamped[i] = clip(W_raw[i], max(W_raw)/4, max(W_raw))

W[i] = W_clamped[i] / Σ_j W_clamped[j]
```

### Stage 3 — Base Value + Condition

```
BaseACV = Σ_i W[i] · C[i].AdjFinal

# CIR scoring against neutral "Avg" baseline
CIR_Delta = Σ_k CIR_Weight[k] · CIR_Score(S.CIR[k])
  where CIR_Score: BelowAvg = −1, Avg = 0, Above = +1, Excellent = +2

CondAdj = CIR_Delta × CondDollarPerPoint(S.SegmentClass)

PostCond = BaseACV + CondAdj
```

### Stage 4 — Structural Multipliers

```
m_title    = MultByBrand(S.TitleBrand)             # Clean = 1.00
m_prior    = 1 − PriorDamagePenalty(S.PriorDamage)
m_use      = MultByUse(S.UseType)                  # Personal = 1.00
m_likebrand = 1.00 if T.LikeBrandGuard active and comps are clean-title
            (guard ensures we don't blend salvage comps into clean subject)

PostStruct = PostCond × m_title × m_prior × m_use × m_likebrand
```

### Stage 5 — Market Drift

```
MonthsElapsed = (S.LossDate − M.PullDate) / 30.4375
DriftMult     = (1 + M.Drift_Pct_PerMonth)^MonthsElapsed    if T.ApplyDrift else 1

PostDrift = PostStruct × DriftMult
```

### Stage 6 — Book Anchor Reconciliation

```
AnchorBand = [min(M.BookAnchor_KBB, M.BookAnchor_NADA, M.BookAnchor_BB) × 0.92,
              max(M.BookAnchor_KBB, M.BookAnchor_NADA, M.BookAnchor_BB) × 1.08]

If PostDrift ∈ AnchorBand:   AnchoredACV = PostDrift
Else:                         AnchoredACV = clip(PostDrift, AnchorBand) ; flag "AnchorClip"
```

### Stage 7 — Add-Backs & Statutory

```
SalesTax = AnchoredACV × A.SalesTaxRate   if A.SalesTaxRule = PaidAtSettlement
         = 0                              if NotOwed
         = deferred (proof-on-replacement) if ReplacementProof

Fees = A.TitleFee + A.RegFee + A.DocFee

PreDeductible = AnchoredACV + SalesTax + Fees

# Deductible timing per AP12
If AP12 = DeductibleBeforeAddBacks:  Settlement_Gross = AnchoredACV − A.Deductible + SalesTax + Fees
If AP12 = DeductibleAfterAddBacks:   Settlement_Gross = PreDeductible − A.Deductible

# Salvage retention
Settlement_Gross −= A.SalvageRetentionValue   if S.SalvageRetention
```

### Stage 8 — LOU / PP / DV (skip if toggles off)

```
LOU_Amount = min(LOU.DailyRate × LOU.Days, LOU.PolicyCap)   if T.IncludeLOU
PP_Amount  = min(Σ PP.Items, PP.SubLimit)                    if T.IncludePP
DV_Amount  = DV.PreLossACV − DV.PostRepairACV                if T.IncludeDV and DV.Eligible
```

### Stage 9 — Lien / Gap

```
EquityToOwner = Settlement_Gross − L.PayoffAmount
If EquityToOwner < 0 and L.GapPolicyExists:  GapClaim = −EquityToOwner
```

### Stage 10 — Output Assembly

```
PointEstimate = AnchoredACV
Range_P25     = percentile(C[i].AdjFinal weighted by W[i], 25)
Range_P75     = percentile(C[i].AdjFinal weighted by W[i], 75)

CV            = stdev(C[i].AdjFinal) / mean(C[i].AdjFinal)
Confidence    = High   if CV < 0.04 and N ≥ 4
              = Medium if CV < 0.08
              = Low    otherwise

AuditCallouts = [every adjustment, weight, suppression, anchor clip, PSA decision]
```

---

## 6. Data Source Catalog

| Variable | Canonical Source | Refresh Cadence |
|---|---|---|
| S.TitleBrand | NMVTIS (via approved data provider) | Per claim |
| S.PriorDamage | CARFAX or AutoCheck | Per claim |
| S.Options[] | OEM build-sheet (Honda iN, GM Service, etc.) + Monroney if S.WindowStickerOnFile | Per claim |
| C[i].* | AutoTrader, Cars.com, CarGurus, dealer DMS feeds (75-mi radius) | Per claim, pulled within 14 days of loss |
| M.PSA_Pct | Internal negotiated-transactions study; segment-specific | Quarterly |
| M.MileageRate | NADA published per-segment mileage tables | Quarterly |
| M.BookAnchor_KBB | KBB API (Private Party / Typical Listing) | Per claim |
| M.BookAnchor_NADA | J.D. Power NADA Clean Retail | Per claim |
| M.BookAnchor_BB | Black Book Retail | Per claim |
| M.Drift_Pct_PerMonth | Manheim Used Vehicle Value Index (segmented) | Monthly |
| A.SalesTaxRule | State DOI bulletins + statutes | Annual review |
| A.SalesTaxRate | State + local revenue dept | Annual review |
| A.TitleFee / RegFee | State DMV fee schedule | Annual review |
| AP12 / AP13 | State case law + DOI bulletins | Annual review |
| LOU.DailyRate | Enterprise / Hertz class-equivalent rates by ZIP | Per claim |

---

## 7. Toggles — Defaults + Justification

| Toggle | Default | Rationale |
|---|---|---|
| T.ApplyPSA | false | PSA is the single most-disputed line in carrier reports. Default off; only enable in Documented mode with a defensible study. |
| T.ApplyDrift | true | Markets move; failing to drift to loss date understates older comp pulls. |
| T.LikeBrandGuard | true | Clean-title subjects must be valued against clean-title comps. Prevents salvage contamination. |
| T.StrictTrim | true | Trim mismatches are the second-largest source of carrier under-valuation. |
| T.UseBookAnchor | true | Triangulation prevents runaway comp-only results in thin markets. |
| T.IncludeLOU | false | Fact-dependent; only when policy provides and days documented. |
| T.IncludePP | false | Claimed separately under PP coverage. |
| T.IncludeDV | false | First-party DV generally excluded by policy language. |
| T.SuppressionAudit | true | Transparency requirement — every excluded comp must be explained. |

---

## 8. Output Schema

```json
{
  "version": "2.0",
  "subject": { "vin": "...", "year": 2021, "make": "Honda", "model": "Accord", "trim": "EX-L 1.5T", "mileage": 42000, "zip": "30309", "lossDate": "2026-03-10" },
  "comps": [
    { "id": "C1", "price": 22890, "mileage": 38000, "trim": "EX-L", "weight": 0.214, "adjusted": 22730, "suppressed": false }
  ],
  "stages": {
    "baseACV": 0,
    "condAdj": 0,
    "postCond": 0,
    "postStruct": 0,
    "postDrift": 0,
    "anchoredACV": 0
  },
  "settlement": {
    "acv": 0,
    "salesTax": 0,
    "fees": { "title": 0, "registration": 0, "doc": 0 },
    "deductible": 0,
    "salvageRetention": 0,
    "gross": 0,
    "lien": { "payoff": 0, "equityToOwner": 0, "gapClaim": 0 }
  },
  "range": { "p25": 0, "p75": 0 },
  "confidence": "High",
  "auditCallouts": [
    "Comp C5 suppressed: trim EX (subject is EX-L)",
    "PSA: not applied (T.ApplyPSA=false)",
    "Like-brand guard active: all comps clean-title",
    "Drift: +1.8% applied over 2.1 months",
    "Anchor band: [22,140 – 25,920]; PostDrift within band"
  ],
  "insurerDelta": { "carrierACV": 0, "engineACV": 0, "delta": 0, "attribution": {} }
}
```

---

## 9. Sample Calculation Walkthrough

### 9.1 Inputs

**Subject:** 2021 Honda Accord EX-L 1.5T, 42,000 mi, ZIP 30309 (Atlanta), loss date 2026-03-10, Clean title, no prior damage, Personal use, Actual odometer, S.WindowStickerOnFile = true.
**Options:** Heated leather seats (factory on EX-L), Honda Sensing (standard), 10-speaker premium audio.
**S.CIR:** Tires = Above; Paint = Avg; Body = Avg; Glass = Avg; Interior = Avg; Mechanical = Above (timing service receipts); Electronics = Avg; Frame = Avg.

**Comps (5; pulled 2026-03-01; M.PullDate = 2026-03-01):**

| ID | Price | Mi | Trim | Notes |
|---|---|---|---|---|
| C1 | 22,890 | 38,000 | EX-L | |
| C2 | 23,500 | 45,000 | EX-L | |
| C3 | 24,100 | 41,000 | EX-L | |
| C4 | 22,400 | 50,000 | EX-L | |
| C5 | 23,950 | 39,000 | **EX** | lower trim |

**Carrier Posture (R-series):** R16 = CCC; R17 = $20,800; R9 = 6% PSA flat; R10 = "Normal" on every CIR category.

**Constants:**
- M.MileageRate = $0.085/mi (mid-size sedan, NADA Q1-2026)
- M.Drift_Pct_PerMonth = +0.85%/mo (Manheim mid-sedan index, recent 90 days)
- M.PSA_Mode = None (T.ApplyPSA = false)
- TrimDelta(EX-L, EX) = +$1,150 (LeatherPkg + audio upgrade delta)
- CondDollarPerPoint(MidSedan) = $140/point
- CIR_Weight: Mechanical 0.25, Body 0.15, Paint 0.15, Interior 0.15, Tires 0.10, Glass 0.10, Electronics 0.05, Frame 0.05

**State / Policy:** GA — A.SalesTaxRule = PaidAtSettlement; A.SalesTaxRate = 7%; A.TitleFee = $18; A.RegFee = $20; A.DocFee = N/A; A.Deductible = $500; AP12 = DeductibleAfterAddBacks; no salvage retention; no lien; no LOU/PP/DV.

---

### 9.2 Stage 1 — Comp Normalization

**Suppression first:** C5 is EX (subject is EX-L). With T.StrictTrim = true, C5 is **suppressed**. AuditCallout: "C5 suppressed — trim mismatch (EX vs EX-L)."

Remaining N = 4. PSA is off (T.ApplyPSA=false). No option-delta among C1–C4 (all EX-L with comparable equipment).

| Comp | Price | MileageΔ vs 42,000 | Mileage Adj | TrimΔ | OptionsΔ | PSA | Adjusted |
|---|---|---|---|---|---|---|---|
| C1 | 22,890 | −4,000 | −340 | 0 | 0 | 0 | **22,550** |
| C2 | 23,500 | +3,000 | +255 | 0 | 0 | 0 | **23,755** |
| C3 | 24,100 | −1,000 | −85 | 0 | 0 | 0 | **24,015** |
| C4 | 22,400 | +8,000 | +680 | 0 | 0 | 0 | **23,080** |

*Mileage adjustment is in the direction that makes the comp equivalent to the subject; comps with higher mileage than subject get an upward adjustment (subject is worth more).*

---

### 9.3 Stage 2 — Weighting (with 4:1 clamp)

SimScore drivers used: trim (all match = 1.0), options (all 1.0), mileage proximity, geographic proximity (all within radius, assume ≈1.0), channel (all dealer-retail = 1.0). Differentiator is mileage proximity.

| Comp | |MileageΔ| | MileageProx | SimScore | W_raw (γ=2) | W_clamped | W (norm) |
|---|---|---|---|---|---|---|
| C1 | 4,000 | 0.733 | 0.946 | 0.895 | 0.895 | 0.260 |
| C2 | 3,000 | 0.800 | 0.960 | 0.922 | 0.922 | 0.268 |
| C3 | 1,000 | 0.933 | 0.987 | 0.974 | 0.974 | 0.283 |
| C4 | 8,000 | 0.467 | 0.893 | 0.798 | 0.798 | 0.232 |
| **Σ** | | | | **3.589** | **3.589** | **1.000** |

Max/Min raw weight ratio = 0.974 / 0.798 = 1.22 — well under 4:1 clamp. No clamp triggered. AuditCallout: "4:1 clamp not engaged."

---

### 9.4 Stage 3 — Base + Condition

```
BaseACV = 0.260·22,550 + 0.268·23,755 + 0.283·24,015 + 0.232·23,080
        = 5,863 + 6,366 + 6,796 + 5,355
        = 23,380
```

**Condition (CIR_Delta):**

| Category | S.CIR | Score | Weight | Contribution |
|---|---|---|---|---|
| Mechanical | Above | +1 | 0.25 | +0.25 |
| Tires | Above | +1 | 0.10 | +0.10 |
| Paint | Avg | 0 | 0.15 | 0 |
| Body | Avg | 0 | 0.15 | 0 |
| Interior | Avg | 0 | 0.15 | 0 |
| Glass | Avg | 0 | 0.10 | 0 |
| Electronics | Avg | 0 | 0.05 | 0 |
| Frame | Avg | 0 | 0.05 | 0 |
| **CIR_Delta** | | | | **+0.35** |

```
CondAdj   = 0.35 × $140 = +$49
PostCond  = 23,380 + 49 = $23,429
```

*(Note: condition uplift is intentionally modest. The bigger condition story versus the carrier is qualitative — carrier defaulted every category to "Normal" and ignored documented mechanical service. AuditCallout records that.)*

---

### 9.5 Stage 4 — Structural Multipliers

- m_title = 1.00 (Clean)
- m_prior = 1.00 (no prior damage)
- m_use = 1.00 (Personal)
- m_likebrand = 1.00 (all retained comps clean-title) — **guard active, no contamination**

```
PostStruct = 23,429 × 1.00 × 1.00 × 1.00 × 1.00 = $23,429
```

AuditCallout: "Like-brand guard engaged; all 4 retained comps are clean-title dealer-retail."

---

### 9.6 Stage 5 — Market Drift

```
MonthsElapsed = (2026-03-10 − 2026-03-01) / 30.4375 = 9 / 30.4375 = 0.2957
DriftMult     = (1 + 0.0085)^0.2957 = 1.00251

PostDrift = 23,429 × 1.00251 = $23,488
```

AuditCallout: "Drift +0.25% over 0.30 months."

---

### 9.7 Stage 6 — Book Anchor

Assume:
- M.BookAnchor_KBB = $23,100
- M.BookAnchor_NADA = $23,850
- M.BookAnchor_BB = $22,700

```
AnchorBand = [22,700 × 0.92, 23,850 × 1.08] = [20,884, 25,758]
PostDrift  = 23,488  ∈  AnchorBand  →  AnchoredACV = 23,488
```

AuditCallout: "Within anchor band; no clip."

---

### 9.8 Stage 7 — Add-Backs

```
AnchoredACV         = 23,488.00
SalesTax (7%)       = 1,644.16
Fees                = 18 + 20 + 0 = 38.00
PreDeductible       = 23,488 + 1,644.16 + 38 = 25,170.16
Deductible (AP12 = After) = −500.00
SalvageRetention    = 0
Settlement_Gross    = 25,170.16 − 500 = 24,670.16
```

---

### 9.9 Stages 8–9

- **Stage 8 — LOU / PP / DV:** Skipped. T.IncludeLOU = false (not claimed), T.IncludePP = false, T.IncludeDV = false (first-party).
- **Stage 9 — Lien / Gap:** Skipped. No lien. EquityToOwner = $24,670.16 routed directly to insured.

---

### 9.10 Stage 10 — Output

**Point Estimate (Pre-Tax ACV):** **$23,488**
**Settlement Gross (net check to insured):** **$24,670.16**

**Range (P25 / P75 across weighted adjusted comps 22,550 / 23,080 / 23,755 / 24,015):**
- P25 ≈ **$22,815**
- P75 ≈ **$23,885**
- Width = $1,070 (4.6% of point estimate)

**Confidence:** CV = stdev(22,550, 23,080, 23,755, 24,015) / mean = 638 / 23,350 = 0.027 → **High** (CV < 0.04, N = 4).

**Audit Callouts:**
1. C5 suppressed (trim mismatch EX vs EX-L)
2. 4:1 weight clamp not engaged
3. CIR uplift +$49 for Mechanical (Above) and Tires (Above)
4. Like-brand guard engaged
5. Drift +0.25% applied
6. Within KBB/NADA/Black Book anchor band; no clip
7. PSA not applied (carrier applied 6% flat — disputed)
8. Sales tax included per GA rule
9. Deductible applied after add-backs per AP12 = GA

### 9.11 Insurer-vs-Engine Delta

Carrier offered ACV = **$20,800**. Engine ACV (pre-tax) = **$23,488**. Delta = **+$2,688 (+12.9%)**.

| Attribution | Carrier Choice | Engine Choice | Estimated Dollar Impact |
|---|---|---|---|
| PSA | 6% flat applied (R9) | Not applied (T.ApplyPSA = false) | **≈ +$1,500** |
| Condition (CIR) | "Normal" on every category (R10) | Mechanical/Tires = Above (documented) | **≈ +$49** |
| Trim handling | EX comp likely retained at face | C5 suppressed; ≈ −$1,150 trim adjustment avoided | **≈ +$300** |
| Mileage rate | Implicit lower rate | $0.085/mi (NADA Q1-2026) | **≈ +$250** |
| Drift | Not applied | +0.25% drift | **≈ +$60** |
| Mix of dealer-retail vs private | Mixed | Dealer-retail only | **≈ +$500** |
| Rounding / other | — | — | **≈ +$29** |
| **Total Reconciled** | | | **≈ +$2,688** |

Result: a defensible **$2,688 (pre-tax)** rebuttal, traceable to specific carrier methodology choices, each of which the carrier cannot document on the rebuttal record.

---

## 10. Implementation Notes

**Spreadsheet:** Use one tab per stage. Stage 1 should be a comp-by-row matrix with one column per adjustment so each delta is auditable. Stage 2 weights live in a small helper block. Stages 3–7 are scalar. Output tab pulls from Stage 7 and Stage 10 with conditional formatting on confidence and on any AnchorClip event. Keep M-series constants on a single "Constants" tab so quarterly refreshes touch one place.

**Function/Code (Next.js + Postgres in modern-tools):** Model each stage as a pure function `stageN(input): output` accepting and returning a typed object. Persist the full intermediate state to a `valuations` table (jsonb column) so any historical report can be re-derived. Use a `comps` child table with a `suppressed` boolean and `suppression_reason` enum. Generate the audit callouts as a structured array, not free text, so the front-end can render and the PDF generator can format consistently. Add a "what if" panel that lets the appraiser toggle T-series at runtime and see the delta.

**Data Refresh Cadence:** Quarterly: M.PSA_Pct, M.MileageRate, M.BookAnchor_* method calibration, state add-back constants. Monthly: M.Drift_Pct_PerMonth from Manheim segment index. Per-claim: comps, NMVTIS, CARFAX/AutoCheck, KBB/NADA/BB live lookups, LOU rate. Annual: state-specific AP12/AP13 rules, sales-tax statute review.

---

## 11. Limitations & Future Work

- **Thin markets / rare configurations:** Where N < 4 within 75 mi, the model auto-expands radius and flags Confidence = Low. A future enhancement is a synthetic-comp module that builds a hedonic regression off a wider regional pull.
- **EV depreciation:** Current M.Drift_Pct_PerMonth is segmented but the EV segment has high variance; consider quarterly recalibration with a wider trust interval until the market stabilizes.
- **Option valuation:** OptionValue_o is a static lookup. Premium audio, ADAS suites, and panoramic roofs warrant per-segment empirical pricing studies. Build a `option_values` table refreshed semi-annually.
- **PSA defensibility:** When T.ApplyPSA is enabled in Documented mode, the underlying study must itself be defensible. Maintain a written PSA Methodology Memo, refreshed quarterly, citing sample size and segment.
- **DV first-party gap:** Some jurisdictions allow first-party DV under specific policy language. Model treats it as off by default; add per-state coverage matrix.
- **Heavy/medium-duty trucks and motorhomes:** Out of scope for v2.0. Distinct segment classes and book sources required.
- **Total-loss-threshold interplay:** This model values ACV. The repair-cost-to-ACV ratio that triggers total-loss treatment is a separate determination and not produced here.
- **State-by-state AP12/AP13 matrix:** Currently maintained as a lookup table; needs annual review with state DOI bulletin diffing.

---

## 12. Appendix — Glossary

| Term | Definition |
|---|---|
| **ACV** | Actual Cash Value — the fair market value of the subject vehicle immediately before the loss, in its actual pre-loss condition. |
| **CCC** | CCC Intelligent Solutions; publisher of CCC ONE Market Valuation Report, the most common insurer total-loss platform. |
| **Mitchell** | Mitchell International; publisher of Mitchell WorkCenter Total Loss. |
| **Audatex** | Solera-owned valuation platform (Autosource). |
| **CIR** | Condition / Inspection Rating — Modern Appraisers' per-category condition grading system (Tires, Paint, Body, Glass, Interior, Mechanical, Electronics, Frame). |
| **PSA** | Projected Sold Adjustment — a downward adjustment applied by carrier platforms to convert "asking" prices to "expected sold" prices. Frequently disputed for lack of documentation. |
| **KBB** | Kelley Blue Book; provides Private Party and Typical Listing values. |
| **NADA** | National Automobile Dealers Association (now J.D. Power Valuation Services); publishes Clean Retail / Clean Trade / Average Trade. |
| **DV** | Diminished Value — the loss in market value attributable to a vehicle having been damaged and repaired. |
| **LOU** | Loss of Use — costs incurred by the insured due to inability to use the vehicle. |
| **PP** | Personal Property — items inside the vehicle at the time of loss, covered under PP sub-limits. |
| **IQR** | Interquartile Range — P75 minus P25. |
| **CV** | Coefficient of Variation — stdev / mean; dimensionless dispersion measure used for the Confidence band. |
| **MSRP** | Manufacturer's Suggested Retail Price — original sticker price; basis for option valuation. |
| **VIN** | Vehicle Identification Number — 17-character identifier used for decoding year/make/model/trim/factory options. |

---

**End of Document — v2.0 (Approved)**
