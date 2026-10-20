"use client"

import { FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Placeholder for client-specific forms. Admin will populate per-client
// forms (intake, release, etc.) in a follow-up pass. For now, renders a
// neutral empty state so the tab exists and loads cleanly.
export function FormsTab({ claimId, clientName }: { claimId: string; clientName: string }) {
  void claimId
  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-black text-lg font-bold tracking-tight">Forms</CardTitle>
      </CardHeader>
      <CardContent className="p-10 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <FileText className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {clientName
            ? <>No forms configured for <b>{clientName}</b> yet.</>
            : 'No client set on this claim yet — assign a client to see their forms.'}
        </p>
        <p className="text-[12px] text-slate-400 mt-2">
          An admin can add client-specific forms here.
        </p>
      </CardContent>
    </Card>
  )
}
