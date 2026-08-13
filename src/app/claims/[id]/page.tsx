"use client"

import { use } from 'react'
import { ClaimWorkspace } from '@/components/claim/ClaimWorkspace'

export default function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ClaimWorkspace claimId={decodeURIComponent(id)} />
}
