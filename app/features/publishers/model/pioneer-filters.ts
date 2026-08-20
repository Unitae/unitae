import type { PublisherType } from '~/shared/types/publisher-type'

import type { RiskBucket } from './pioneer-pace'
import type { PioneerActivitySummary, PioneerAnnualRow, PioneerAuxiliaryRow } from './pioneer-roster.type'

export interface PioneerFilters {
  q: string
  risk: RiskBucket | 'all'
  type: PublisherType | 'all'
  group: string
}

export function readPioneerFilters(params: URLSearchParams): PioneerFilters {
  return {
    q: params.get('q') ?? '',
    risk: (params.get('risk') as PioneerFilters['risk']) || 'all',
    type: (params.get('type') as PioneerFilters['type']) || 'all',
    group: params.get('group') ?? 'all',
  }
}

export function pioneerFiltersAreEmpty(f: PioneerFilters): boolean {
  return f.q === '' && f.risk === 'all' && f.type === 'all' && f.group === 'all'
}

function matchesBase(
  row: { firstname: string; lastname: string; type: PublisherType; groupName: string | null },
  f: PioneerFilters,
): boolean {
  if (f.q && !`${row.firstname} ${row.lastname}`.toLowerCase().includes(f.q.toLowerCase())) return false
  if (f.type !== 'all' && row.type !== f.type) return false
  if (f.group !== 'all' && (row.groupName ?? '') !== f.group) return false
  return true
}

export function filterAnnual(rows: PioneerAnnualRow[], f: PioneerFilters): PioneerAnnualRow[] {
  return rows.filter(r => matchesBase(r, f) && (f.risk === 'all' || r.pace.riskBucket === f.risk))
}

export function filterAuxiliary(rows: PioneerAuxiliaryRow[], f: PioneerFilters): PioneerAuxiliaryRow[] {
  // Auxiliaries carry no risk bucket, so any risk filter excludes them.
  if (f.risk !== 'all') return []
  return rows.filter(r => matchesBase(r, f))
}

export function distinctGroups(summary: PioneerActivitySummary): string[] {
  const set = new Set<string>()
  for (const row of [...summary.annual, ...summary.auxiliary]) {
    if (row.groupName) set.add(row.groupName)
  }
  return [...set].sort()
}
