"use client"

// Shared building blocks for the settings pages (Section header + ToggleRow +
// SectionCard). Kept in _shared so each section page stays focused on its
// own state.

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      </div>
      <div className="px-6 py-4">{children}</div>
    </section>
  )
}

export function ToggleRow({
  label,
  description,
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
  return (
    <div className="flex items-start justify-between gap-6 py-3 first:pt-0 last:pb-0 border-t border-gray-100 first:border-t-0">
      <div>
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      </div>
      <button
        onClick={() => value !== null && onChange(!value)}
        disabled={value === null || loading || disabled}
        className={`shrink-0 mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
          value ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
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
