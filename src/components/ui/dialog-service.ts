// Module-level imperative API for in-site confirm/alert dialogs.
//
// Call sites just do:   await confirmDialog('Delete this?')   or   await alertDialog('Save failed.')
// A single <DialogRoot /> mounted in src/app/layout.tsx handles rendering.
//
// Browser `window.confirm` / `window.alert` are banned in this codebase — see
// CLAUDE.md "HARD RULE: No native browser dialogs". Use these instead.

import type React from 'react'

export type ConfirmOpts = {
  title?: string
  message?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
}

export type AlertOpts = {
  title?: string
  message?: React.ReactNode
  okLabel?: string
  variant?: 'primary' | 'danger'
}

type DialogRequest =
  | { kind: 'confirm'; opts: Required<Pick<ConfirmOpts, 'title'>> & ConfirmOpts; resolve: (ok: boolean) => void }
  | { kind: 'alert'; opts: Required<Pick<AlertOpts, 'title'>> & AlertOpts; resolve: () => void }

type Opener = (req: DialogRequest) => void

let currentOpener: Opener | null = null

export function setDialogOpener(fn: Opener | null) {
  currentOpener = fn
}

function pushRequest(req: DialogRequest) {
  if (!currentOpener) {
    // Defensive: in dev we shouldn't hit this. The DialogRoot is mounted at
    // the app layout level so it should always be available by first paint.
    console.error('[dialog-service] DialogRoot not mounted — dialog request dropped', req)
    if (req.kind === 'confirm') (req.resolve as (ok: boolean) => void)(false)
    else (req.resolve as () => void)()
    return
  }
  currentOpener(req)
}

export function confirmDialog(opts: string | ConfirmOpts): Promise<boolean> {
  const normalized: ConfirmOpts =
    typeof opts === 'string' ? { message: opts } : opts
  return new Promise<boolean>((resolve) => {
    pushRequest({
      kind: 'confirm',
      opts: { title: normalized.title ?? 'Confirm', ...normalized },
      resolve,
    })
  })
}

export function alertDialog(opts: string | AlertOpts): Promise<void> {
  const normalized: AlertOpts = typeof opts === 'string' ? { message: opts } : opts
  return new Promise<void>((resolve) => {
    pushRequest({
      kind: 'alert',
      opts: { title: normalized.title ?? 'Notice', ...normalized },
      resolve,
    })
  })
}

// For DialogRoot only — not part of the public API.
export type { DialogRequest }
