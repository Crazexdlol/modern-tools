'use client'

import { useEffect, useState } from 'react'
import { ConfirmDialog } from './confirm-dialog'
import { setDialogOpener, type DialogRequest } from './dialog-service'

// Mounted once by src/app/layout.tsx. Serializes dialog requests so a second
// confirmDialog()/alertDialog() call waits for the first to resolve.
export function DialogRoot() {
  const [queue, setQueue] = useState<DialogRequest[]>([])

  useEffect(() => {
    setDialogOpener((req) => setQueue((q) => [...q, req]))
    return () => setDialogOpener(null)
  }, [])

  const current = queue[0]
  if (!current) return null

  const dismiss = () => setQueue((q) => q.slice(1))

  if (current.kind === 'confirm') {
    return (
      <ConfirmDialog
        open
        title={current.opts.title}
        message={current.opts.message}
        confirmLabel={current.opts.confirmLabel ?? 'Confirm'}
        cancelLabel={current.opts.cancelLabel ?? 'Cancel'}
        variant={current.opts.variant ?? 'primary'}
        onConfirm={() => {
          current.resolve(true)
          dismiss()
        }}
        onCancel={() => {
          current.resolve(false)
          dismiss()
        }}
      />
    )
  }

  return (
    <ConfirmDialog
      open
      title={current.opts.title}
      message={current.opts.message}
      confirmLabel={current.opts.okLabel ?? 'OK'}
      cancelLabel={null}
      variant={current.opts.variant ?? 'primary'}
      onConfirm={() => {
        current.resolve()
        dismiss()
      }}
      onCancel={() => {
        current.resolve()
        dismiss()
      }}
    />
  )
}
