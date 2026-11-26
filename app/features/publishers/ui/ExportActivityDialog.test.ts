import { describe, expect, it } from 'vitest'
import { buildExportUrl, exportMonths, initialExportYear } from './ExportActivityDialog'

describe('buildExportUrl', () => {
  it('builds an XLSX URL with just the year', () => {
    expect(buildExportUrl({ format: 'xlsx', year: 2025, scope: 'all', groupId: null, publisherIds: [] })).toBe(
      '/publishers/activity/export/xlsx?year=2025',
    )
  })

  it('ignores scope filters for XLSX even when set', () => {
    expect(buildExportUrl({ format: 'xlsx', year: 2025, scope: 'group', groupId: 3, publisherIds: [] })).toBe(
      '/publishers/activity/export/xlsx?year=2025',
    )
  })

  it('builds a PDF URL with just the year for the "all" scope', () => {
    expect(buildExportUrl({ format: 'pdfs', year: 2025, scope: 'all', groupId: null, publisherIds: [] })).toBe(
      '/publishers/activity/export/pdfs?year=2025',
    )
  })

  it('adds groupId when the group scope is picked', () => {
    expect(buildExportUrl({ format: 'pdfs', year: 2025, scope: 'group', groupId: 7, publisherIds: [] })).toBe(
      '/publishers/activity/export/pdfs?year=2025&groupId=7',
    )
  })

  it('returns null when the group scope is picked without a group', () => {
    expect(buildExportUrl({ format: 'pdfs', year: 2025, scope: 'group', groupId: null, publisherIds: [] })).toBeNull()
  })

  it('adds publisherIds when the members scope is picked', () => {
    expect(
      buildExportUrl({ format: 'pdfs', year: 2025, scope: 'members', groupId: null, publisherIds: [5, 12, 21] }),
    ).toBe('/publishers/activity/export/pdfs?year=2025&publisherIds=5%2C12%2C21')
  })

  it('returns null when the members scope is picked without any publisher', () => {
    expect(buildExportUrl({ format: 'pdfs', year: 2025, scope: 'members', groupId: null, publisherIds: [] })).toBeNull()
  })

  it('targets the single-publisher S-21 route when a publisherId is given', () => {
    expect(
      buildExportUrl({ format: 'pdfs', year: 2024, scope: 'all', groupId: null, publisherIds: [], publisherId: 7 }),
    ).toBe('/publishers/7/activity/pdf?year=2024')
  })

  it('points the S-1 at the month shown, whatever the year and scope say', () => {
    expect(
      buildExportUrl({
        format: 's1',
        year: 2024,
        scope: 'group',
        groupId: 3,
        publisherIds: [],
        month: { month: 9, year: 2026 },
      }),
    ).toBe('/attendance/branch-report.pdf?month=9&year=2026')
  })

  it('has no S-1 without a month', () => {
    expect(buildExportUrl({ format: 's1', year: 2025, scope: 'all', groupId: null, publisherIds: [] })).toBeNull()
  })

  it('ignores format and scope for a single publisher — the S-21 is always one PDF', () => {
    expect(
      buildExportUrl({ format: 'xlsx', year: 2024, scope: 'group', groupId: 3, publisherIds: [1], publisherId: 7 }),
    ).toBe('/publishers/7/activity/pdf?year=2024')
  })
})

describe('initialExportYear', () => {
  it('starts on the default year when it is offered', () => {
    expect(initialExportYear([2026, 2025, 2024], 2025)).toBe(2025)
  })

  it('falls back to the most recent offered year when the default is not among them', () => {
    // Early September: the current service year has no report yet, so it is not selectable.
    expect(initialExportYear([2025, 2024], 2026)).toBe(2025)
  })

  it('keeps the default year when nothing is offered', () => {
    expect(initialExportYear([], 2026)).toBe(2026)
  })
})

describe('exportMonths', () => {
  it('lists the months of the service years with reports, newest first, never one still to come', () => {
    const months = exportMonths([2026, 2025], { month: 10, year: 2026 })

    expect(months.slice(0, 4)).toEqual([
      { month: 10, year: 2026 },
      { month: 9, year: 2026 },
      { month: 8, year: 2026 },
      { month: 7, year: 2026 },
    ])
    // 2026–2027 so far (September to November), then all of 2025–2026.
    expect(months).toHaveLength(3 + 12)
    expect(months.at(-1)).toEqual({ month: 8, year: 2025 })
  })

  it('offers the current month when no year has a report yet', () => {
    expect(exportMonths([], { month: 2, year: 2027 })).toEqual([{ month: 2, year: 2027 }])
  })
})
