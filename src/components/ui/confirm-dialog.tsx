"use client"

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// In-app confirm modal to replace the browser's confirm() popup.
// Renders nothing when open=false; overlays the page when open=true.
// ESC or click-outside cancels; the confirm button runs the passed handler.
export interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
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
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500 text-white'
      : 'bg-blue-600 hover:bg-blue-500 text-white'

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {message && (
          <div className="text-sm text-gray-700 leading-relaxed">{message}</div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={busy}
            className="border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} disabled={busy} className={confirmClass}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
