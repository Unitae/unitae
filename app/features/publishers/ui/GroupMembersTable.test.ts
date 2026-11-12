import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { type GroupMemberRow, GroupMembersTable } from './GroupMembersTable'

// The layout itself is CSS container queries, which markup cannot show. What it can pin is the
// structure those classes act on: which rows exist, what they span, and where the links lead.

const MEMBER_ID = 8841
const SIREN_BUTTON = /<button type="button"[^>]*aria-label="[^"]*Ana LIMA/
const WINDOW = [{ month: 9, year: 2026 }]

const member = (overrides: Partial<GroupMemberRow> = {}): GroupMemberRow => ({
  id: MEMBER_ID,
  firstname: 'Ana',
  lastname: 'Lima',
  email: '',
  lastPastoralVisitAt: null,
  reports: [{ month: 9, year: 2026, status: 'filed', id: 5 }],
  signals: [],
  emergencyGaps: [],
  ...overrides,
})

function render(members: GroupMemberRow[], props: Partial<Parameters<typeof GroupMembersTable>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(GroupMembersTable, {
        members,
        reportWindow: WINDOW,
        canManageActivity: true,
        canCorrectReports: false,
        canRecordVisits: false,
        canEditPublishers: false,
        canViewPublishers: true,
        selected: null,
        onOpenReport: () => {},
        onOpenEmergency: () => {},
        onOpenVisit: () => {},
        ...props,
      }),
    ),
  )
}

// Body rows only: the header row is the first `<tr>`.
const bodyRows = (html: string) => html.split('<tbody')[1]?.split('<tr').length - 1

describe('GroupMembersTable', () => {
  it('gives a member with no signal a single row', () => {
    expect(bodyRows(render([member()]))).toBe(1)
  })

  it('gives a labelled member a row of their own for the labels', () => {
    const html = render([member({ signals: [{ kind: 'new-arrival' }] })])

    expect(bodyRows(html)).toBe(2)
  })

  it('does not add a row for missing emergency information alone', () => {
    // It shows as an icon after the name, so most rows would otherwise double in height.
    expect(bodyRows(render([member({ emergencyGaps: ['contact'] })]))).toBe(1)
  })

  it('spans the name and report columns, or just the name without reports', () => {
    const labelled = member({ signals: [{ kind: 'new-arrival' }] })

    expect(render([labelled])).toContain('colSpan="3"')
    expect(render([labelled], { canManageActivity: false })).toContain('colSpan="1"')
  })

  it('opens the emergency panel from a button naming who and what is missing, not a page of its own', () => {
    const html = render([member({ emergencyGaps: ['card', 'contact'] })])

    expect(html).not.toContain('/emergency')
    expect(html).toMatch(SIREN_BUTTON)
    expect(html).toContain('Ana LIMA')
    expect(html).toContain('carte DPA')
    expect(html).toContain('contact d’urgence')
  })

  it('shows no emergency icon when nothing is missing', () => {
    expect(render([member()])).not.toContain('/emergency')
  })

  it('leaves the name unlinked for a viewer who may not open records', () => {
    const html = render([member()], { canViewPublishers: false })

    expect(html).not.toContain(`href="/publishers/${MEMBER_ID}/view"`)
    expect(html).toContain('Ana')
  })
})
