"use client"

import { useEffect } from 'react'

// In-app confirm modal to replace the browser's confirm() popup.
// Renders nothing when open=false; overlays the page when open=true.
// ESC or click-outside cancels; the confirm button runs the passed handler.
export interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  // Pass `null` to render a one-button notice (alert-style) with no cancel.
  cancelLabel?: string | null
  variant?: 'primary' | 'danger'
  busy?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
      // Enter confirms — matches native browser confirm() ergonomics and lets
      // keyboard users complete/dismiss dialogs without tabbing to the button.
      // Skip if the focus is inside a textarea (so multi-line message inputs
      // don't accidentally submit on newline).
      if (e.key === 'Enter' && !busy) {
        const target = e.target as HTMLElement | null
        if (target?.tagName !== 'TEXTAREA') {
          e.preventDefault()
          onConfirm()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel, onConfirm])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-slate-950/50 flex items-center justify-center z-50 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div
        className="bg-white rounded-xl w-full max-w-md p-5 space-y-4 ring-1 ring-slate-200"
        style={{ boxShadow: 'var(--hp-elev-pop)' }}
      >
        <h2 className="text-[16px] font-semibold text-slate-900 tracking-tight">{title}</h2>
        {message && (
          <div className="text-[13.5px] text-slate-600 leading-relaxed">{message}</div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          {cancelLabel !== null && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="hp-btn hp-btn-secondary disabled:opacity-60 disabled:pointer-events-none"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`hp-btn ${variant === 'danger' ? 'hp-btn-danger' : 'hp-btn-primary'} disabled:opacity-60 disabled:pointer-events-none`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
