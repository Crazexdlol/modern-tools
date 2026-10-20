'use client'

// Accounting — placeholder UI for Henry Admin's company financials.
//
// Top-level tabs:
//   • Overview — contains four sub-tabs: Summary / Claim Revenue / Billing Rates / Expenses
//   • Henry    — placeholder for Henry-specific payroll + personal finance view (next session)
//
// Nothing on this page persists yet. All lists are intentionally empty — Henry
// will fill them in once the data model is wired. The structure matches the
// spec:
//   1. Claim deliveries → billed − appraiser payout = profit, Delivered vs Paid
//   2. Billing rates matrix (company × claim type)
//   3. Non-claim expenses (salaries, subscriptions, one-time)

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  AlertCircle,
  TrendingUp,
  Receipt,
  Clock,
  Plus,
  CheckCircle2,
  Users as UsersIcon,
  User as UserIcon,
} from 'lucide-react'

// ─── Shared formatter ────────────────────────────────────────────────────────

const USD = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// ─── Component ───────────────────────────────────────────────────────────────

type TopTab = 'overview' | 'henry'

export function AccountingClient() {
  const [tab, setTab] = useState<TopTab>('overview')

  return (
    <div className="space-y-4">
      <PlaceholderNotice />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TopTab)}>
        <TabsList className="grid grid-cols-2 w-full max-w-sm h-9 bg-gray-100">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Overview</TabsTrigger>
          <TabsTrigger value="henry"    className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Henry</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5"><OverviewTab /></TabsContent>
        <TabsContent value="henry"    className="mt-5"><HenryTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Placeholder notice ──────────────────────────────────────────────────────

function PlaceholderNotice() {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div>
        <span className="font-semibold">Placeholder.</span> UI shell only — live wiring to real claim deliveries, appraiser payouts, and expense tracking is next.
      </div>
    </div>
  )
}

// ─── Overview (top-level tab) — holds the four sub-tabs ─────────────────────

type OverviewSub = 'summary' | 'claims' | 'rates' | 'expenses'

function OverviewTab() {
  const [sub, setSub] = useState<OverviewSub>('summary')
  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as OverviewSub)}>
      <TabsList className="grid grid-cols-4 w-full max-w-2xl h-9 bg-gray-100">
        <TabsTrigger value="summary"  className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Summary</TabsTrigger>
        <TabsTrigger value="claims"   className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Claim Revenue</TabsTrigger>
        <TabsTrigger value="rates"    className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Billing Rates</TabsTrigger>
        <TabsTrigger value="expenses" className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Expenses</TabsTrigger>
      </TabsList>

      <TabsContent value="summary"  className="mt-5"><SummarySub  /></TabsContent>
      <TabsContent value="claims"   className="mt-5"><ClaimsSub   /></TabsContent>
      <TabsContent value="rates"    className="mt-5"><RatesSub    /></TabsContent>
      <TabsContent value="expenses" className="mt-5"><ExpensesSub /></TabsContent>
    </Tabs>
  )
}

// ─── Summary sub-tab ────────────────────────────────────────────────────────

function SummarySub() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard Icon={Clock}         label="Pending Payment"  sublabel="Delivered, awaiting payment"       value={USD(0)} footnote="No deliveries yet." tone="amber"   />
        <KpiCard Icon={CheckCircle2}  label="Paid Revenue"     sublabel="Fully closed-out claims"           value={USD(0)} footnote="No payments yet."   tone="emerald" />
        <KpiCard Icon={Receipt}       label="Monthly Expenses" sublabel="Salaries + subscriptions"          value={USD(0)} footnote="No expenses yet."   tone="slate"   />
        <KpiCard Icon={TrendingUp}    label="Net (Month)"      sublabel="Paid profit − monthly expenses"    value={USD(0)} footnote="—"                   tone="slate"   />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BreakdownCard title="Delivered — pending payment" rows={[
          { label: 'Billed',           value: USD(0) },
          { label: 'Appraiser payout', value: `− ${USD(0)}` },
          { label: 'Estimated profit', value: USD(0), emphasize: true },
        ]} />
        <BreakdownCard title="Paid — fully closed" rows={[
          { label: 'Billed',           value: USD(0) },
          { label: 'Appraiser payout', value: `− ${USD(0)}` },
          { label: 'Realized profit',  value: USD(0), emphasize: true },
        ]} />
      </div>

      <div className="text-xs text-slate-500 italic">
        Chart placeholder — monthly revenue vs. expenses over the last 12 months.
      </div>
    </div>
  )
}

function KpiCard({
  Icon, label, sublabel, value, footnote, tone,
}: {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  sublabel: string
  value: string
  footnote: string
  tone: 'emerald' | 'amber' | 'slate' | 'rose'
}) {
  const toneClass = {
    emerald: 'text-emerald-700 bg-emerald-50 ring-emerald-100',
    amber:   'text-amber-700 bg-amber-50 ring-amber-100',
    slate:   'text-slate-700 bg-slate-50 ring-slate-200',
    rose:    'text-rose-700 bg-rose-50 ring-rose-100',
  }[tone]
  return (
    <div className="hp-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
        <div className={`w-7 h-7 rounded-md ring-1 flex items-center justify-center ${toneClass}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
      <div className="text-[11.5px] text-slate-500 mt-0.5">{sublabel}</div>
      <div className="text-[11px] text-slate-600 mt-2">{footnote}</div>
    </div>
  )
}

function BreakdownCard({
  title, rows,
}: {
  title: string
  rows: { label: string; value: string; emphasize?: boolean }[]
}) {
  return (
    <div className="hp-card p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">{title}</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`flex items-center justify-between text-sm ${
              r.emphasize ? 'pt-2 mt-1 border-t border-slate-100 font-bold text-slate-900' : 'text-slate-700'
            }`}
          >
            <span>{r.label}</span>
            <span className="tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Claim Revenue sub-tab ──────────────────────────────────────────────────

type ClaimFilter = 'all' | 'delivered' | 'paid'

function ClaimsSub() {
  const [filter, setFilter] = useState<ClaimFilter>('all')
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded border border-gray-200 bg-white overflow-hidden text-xs">
          {([
            ['all',       'All'],
            ['delivered', 'Delivered'],
            ['paid',      'Paid'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                filter === k ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-600 tabular-nums">
          0 claims · Billed <span className="font-semibold text-slate-900">{USD(0)}</span> · Payout <span className="font-semibold text-slate-900">{USD(0)}</span> · Profit <span className="font-semibold text-emerald-700">{USD(0)}</span>
        </div>
      </div>

      <div className="hp-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">MA#</th>
              <th className="text-left px-3 py-2 font-semibold">Insured</th>
              <th className="text-left px-3 py-2 font-semibold">Company</th>
              <th className="text-left px-3 py-2 font-semibold">Type</th>
              <th className="text-left px-3 py-2 font-semibold">Handler</th>
              <th className="text-right px-3 py-2 font-semibold">Billed</th>
              <th className="text-right px-3 py-2 font-semibold">Payout</th>
              <th className="text-right px-3 py-2 font-semibold">Profit</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                No claims yet. Delivered and paid claims will appear here once accounting is wired up.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 italic">
        Rows will pull from <code>acv_history</code> — Delivered maps to <code>workflowStage=&apos;delivery&apos;</code>, Paid to <code>workflowStage=&apos;payment&apos;</code> or closed-with-payment-date.
      </div>
    </div>
  )
}

// ─── Billing Rates sub-tab ──────────────────────────────────────────────────

function RatesSub() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600">
          Rate by company × claim type. Edit a cell to change what we bill.
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-8">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add rate
        </Button>
      </div>

      <div className="hp-card overflow-hidden">
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          No billing rates configured yet. Add a rate to start tracking profit per claim.
        </div>
      </div>

      <div className="hp-card p-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <UsersIcon className="w-3 h-3" /> Appraiser payouts
        </div>
        <div className="text-sm text-slate-700">
          Each appraiser has a per-claim-type payout in their <strong>Fee Catalog</strong> entry (<code>admin/settings/fee-catalog</code>). When a claim is delivered, we subtract the handling appraiser&apos;s fee from the billed rate above to compute profit.
        </div>
      </div>
    </div>
  )
}

// ─── Expenses sub-tab ───────────────────────────────────────────────────────

function ExpensesSub() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600">
          Non-claim expenses — salaries, software, subscriptions, one-time costs.
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-8">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add expense
        </Button>
      </div>

      <EmptyExpenseGroup title="Monthly recurring" totalLabel="per month" />
      <EmptyExpenseGroup title="Yearly recurring"  totalLabel="per year"  />
      <EmptyExpenseGroup title="One-time"          totalLabel="total"      />
    </div>
  )
}

function EmptyExpenseGroup({ title, totalLabel }: { title: string; totalLabel: string }) {
  return (
    <div className="hp-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
        <div className="text-xs text-slate-600 tabular-nums">
          <span className="font-semibold text-slate-900">{USD(0)}</span> {totalLabel}
        </div>
      </div>
      <div className="px-4 py-6 text-center text-xs text-slate-500">
        No {title.toLowerCase()} expenses yet.
      </div>
    </div>
  )
}

// ─── Henry (top-level tab) — placeholder for next session ───────────────────

function HenryTab() {
  return (
    <div className="hp-card p-10 text-center">
      <div className="w-10 h-10 rounded-full bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center mx-auto mb-3">
        <UserIcon className="w-5 h-5 text-blue-600" />
      </div>
      <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Henry</h2>
      <p className="text-sm text-slate-600 max-w-md mx-auto">
        Henry-specific payroll and personal finance view. Design + wiring coming next session.
      </p>
    </div>
  )
}
