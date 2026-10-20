"use client"

// Shared building blocks for the settings pages (Section header + ToggleRow +
// SectionCard). Kept in _shared so each section page stays focused on its
// own state.

export function SectionCard({
  title,
  // description prop is accepted for backwards-compat but intentionally not
  // rendered — Henry asked to drop the "random explanations everywhere" look.
  description: _description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  // reference the arg to satisfy no-unused-vars without rendering it
  void _description
  return (
    <section className="hp-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export function ToggleRow({
  label,
  // description intentionally not rendered — same reason as SectionCard.
  description: _description,
  value,
  onChange,
  loading,
  disabled,
}: {
  label: string
  description?: React.ReactNode
  value: boolean | null
  onChange: (next: boolean) => void
  loading?: boolean
  disabled?: boolean
}) {
  void _description
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0 border-t border-slate-100 first:border-t-0">
      <div className="text-[13.5px] font-medium text-slate-900">{label}</div>
      <button
        onClick={() => value !== null && onChange(!value)}
        disabled={value === null || loading || disabled}
        className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
          value ? 'bg-slate-900' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
            value ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

// Three-state toggle (Off / Follow / On) for per-user overrides that can
// take an explicit true, an explicit false, or null (= inherit from global).
export function TriToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean | null
  onChange: (next: boolean | null) => void
  disabled?: boolean
}) {
  const buttonClass = (active: boolean) =>
    `px-2.5 py-1 text-xs font-semibold transition-colors ${
      active ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
    }`
  return (
    <div className="inline-flex rounded border border-gray-200 overflow-hidden shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(false)}
        className={buttonClass(value === false)}
      >
        Off
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(null)}
        className={`${buttonClass(value === null)} border-x border-gray-200`}
      >
        Follow
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(true)}
        className={buttonClass(value === true)}
      >
        On
      </button>
    </div>
  )
}
