import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { getDynamicDocumentData } from '~/features/display-board/server/dynamic-documents.server'
import { renderSheet } from '~/features/display-board/ui/dynamic/pdf/__fixtures__/render-sheet'
import type { BoardSheetData } from '~/features/display-board/ui/dynamic/pdf/board-sheet'
import {
  buildReferenceCongregation,
  deleteReferenceCongregation,
  REFERENCE_NOW,
  REFERENCE_TIMEZONE,
  type ReferenceCongregation,
  referenceDb,
  withScope,
} from '~/tests/fixtures/events-reference'
import { reference } from '~/tests/fixtures/reference-normalise'

// What the board's programme documents show today, on screen and on paper, for every configuration: the reference the
// schedules refactor must keep. A change here is a change of what congregations read on their board.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 })

let fixture: ReferenceCongregation

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: REFERENCE_NOW })
  fixture = await buildReferenceCongregation(`board-${randomUUID().slice(0, 8)}`)
})

afterAll(async () => {
  vi.useRealTimers()
  if (fixture) await deleteReferenceCongregation(fixture.congregationId)
  await referenceDb.$disconnect()
})

const DOCUMENTS = ['by-date', 'by-template', 'midweek-parts', 'weekend-services'] as const

function readDocument(name: (typeof DOCUMENTS)[number]) {
  const { congregationId } = fixture
  return withScope(congregationId, async db => {
    const settings = await db.boardDynamicDocumentSettings.findFirstOrThrow({
      where: { id: fixture.documents[name], congregationId },
    })
    return getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
      showServices: settings.showServices,
      dynamicConfig: settings.dynamicConfig,
      attendance: { timeZone: REFERENCE_TIMEZONE, now: REFERENCE_NOW },
    })
  })
}

function withServicesByName<T>(data: T): T {
  const events = (data as { events?: { eventServiceParts?: { name: string }[] }[] }).events
  if (!events) return data
  return {
    ...data,
    events: events.map(event => ({
      ...event,
      eventServiceParts: event.eventServiceParts
        ? [...event.eventServiceParts].sort((a, b) => a.name.localeCompare(b.name))
        : event.eventServiceParts,
    })),
  }
}

describe.each(DOCUMENTS)('the programme document « %s »', name => {
  it('returns the same data', async () => {
    const data = await readDocument(name)

    expect(data?.type).toBe(DynamicType.Programme)
    await expect(reference(data)).toMatchFileSnapshot(`./__references__/board-${name}.json`)
  })

  it('prints the same sheet', async () => {
    const data = await readDocument(name)

    // Today the services print in the order the database returns them, which is not defined: sorted by name here so
    // the reference does not depend on it (the schedules refactor gives duties an order of their own).
    const pages = await renderSheet(
      withServicesByName(data) as BoardSheetData,
      { typeface: 'fira', accent: 'teal', layout: 'list' },
      { asOf: REFERENCE_NOW },
    )

    const text = pages.map((page, index) => `--- page ${index + 1}\n${page.text}`).join('\n')
    await expect(`${text}\n`).toMatchFileSnapshot(`./__references__/board-${name}.pdf.txt`)
  })
})
