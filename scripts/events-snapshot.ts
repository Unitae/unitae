// Upgrade rehearsal for the event schedules refactor (docs/development/specs/event-schedules-plan.md §2a): dumps what
// the readers give every congregation of a database — programmes, the board's live documents, each person's dashboard
// and calendar feed — so that a dump taken before a migration and the new image can be compared with one taken after.
//
//   pnpm tsx scripts/events-snapshot.ts dump <file.json> --now 2026-11-20T12:00:00Z
//   pnpm tsx scripts/events-snapshot.ts compare <before.json> <after.json> [--ignore-key scheduleId]...
//
// Run it on a scratch copy of the demo database, never on production unless the operator decides to: it reads every
// congregation. Both dumps must use the same --now. Take the « before » dump with the code that is running, the
// « after » one with the code that replaces it.

import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { getConflictingAssignments } from '../app/features/dashboard/server/dashboard.server'
import { getOpenParts } from '../app/features/dashboard/server/get-open-parts.server'
import { getResponsibleConflicts } from '../app/features/dashboard/server/get-responsible-conflicts.server'
import { getUpcomingAssignments } from '../app/features/dashboard/server/get-upcoming-assignments.server'
import { nextMeetingForViewer } from '../app/features/dashboard/server/next-meeting-for-viewer.server'
import { getDynamicDocumentData } from '../app/features/display-board/server/dynamic-documents.server'
import { buildPersonalCalendarIcs } from '../app/features/events/server/build-personal-calendar.server'
import { getEventProgramme } from '../app/features/events/server/event-part-assignments.server'
import { getPersonalAssignments } from '../app/features/events/server/personal-assignments.server'
import { listProgrammes } from '../app/features/events/server/programme-list.queries'
import { unscopedDb, withScope } from '../app/shared/infra/db.server'
import { Permission } from '../app/shared/types/permission'
import { diffSnapshots } from './events-snapshot-diff'

const DAY = 24 * 60 * 60 * 1000
const DTSTAMP = /DTSTAMP:\d{8}T\d{6}Z/g

/** What every reader gives one congregation, at `now`. */
function dumpCongregation(congregationId: number, timeZone: string, now: Date) {
  return withScope(congregationId, async db => {
    const from = new Date(now.getTime() - 60 * DAY)
    const to = new Date(now.getTime() + 120 * DAY)
    const programmeList = await listProgrammes(db, { congregationId, from, to })
    const programmes: Record<number, unknown> = {}
    for (const item of programmeList) programmes[item.id] = await getEventProgramme(db, item.id, congregationId)

    const documents = await db.boardDynamicDocumentSettings.findMany({
      where: { congregationId },
      orderBy: { id: 'asc' },
    })
    const board: Record<number, unknown> = {}
    for (const settings of documents) {
      board[settings.id] = await getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
        showServices: settings.showServices,
        dynamicConfig: settings.dynamicConfig,
        attendance: { timeZone, now },
      })
    }

    const accounts = await db.userAccount.findMany({
      where: { congregationId, memberId: { not: null } },
      select: { id: true, memberId: true },
      orderBy: { id: 'asc' },
    })
    const people: Record<number, unknown> = {}
    for (const { id: accountId, memberId } of accounts) {
      if (memberId == null) continue
      const items = await getPersonalAssignments(db, accountId, congregationId, from)
      const order = (item: (typeof items)[number]) => `${item.start.toISOString()} ${item.kind} ${item.summary}`
      people[accountId] = {
        nextMeeting: await nextMeetingForViewer(db, {
          accountId,
          memberId,
          congregationId,
          permissions: new Set([Permission.CanViewPrograms]),
          audience: 'programmes',
        }),
        nextMeetingOnTheBoard: await nextMeetingForViewer(db, {
          accountId,
          memberId,
          congregationId,
          permissions: new Set([Permission.CanViewBoard]),
          audience: 'board',
        }),
        upcomingAssignments: await getUpcomingAssignments(db, memberId, congregationId, now),
        conflictingAssignments: await getConflictingAssignments(db, memberId),
        responsibleConflicts: await getResponsibleConflicts(db, accountId, congregationId, false),
        // DTSTAMP is the moment the feed was written: the wall clock, not the data.
        feed: buildPersonalCalendarIcs({
          items: [...items].sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0)),
          userLabel: String(accountId),
          uidDomain: 'snapshot.local',
        }).replace(DTSTAMP, 'DTSTAMP:<written>'),
      }
    }

    return {
      programmeList,
      programmes,
      board,
      openParts: await getOpenParts(db, congregationId, { templateIds: null, days: 60, now }),
      people,
    }
  })
}

async function dump(file: string, now: Date) {
  const congregations = await unscopedDb.congregation.findMany({
    select: { id: true, timezone: true },
    orderBy: { id: 'asc' },
  })
  const result: Record<number, unknown> = {}
  for (const congregation of congregations) {
    result[congregation.id] = await dumpCongregation(congregation.id, congregation.timezone, now)
  }
  // Round-tripped through JSON as compare reads it back: dates become strings, undefined goes.
  writeFileSync(file, `${JSON.stringify({ now: now.toISOString(), congregations: result }, null, 2)}\n`)
  process.stdout.write(`${congregations.length} congregation(s) written to ${file}\n`)
}

function compare(beforeFile: string, afterFile: string, ignoredKeys: Set<string>) {
  const before = JSON.parse(readFileSync(beforeFile, 'utf8'))
  const after = JSON.parse(readFileSync(afterFile, 'utf8'))
  if (before.now !== after.now)
    throw new Error(`The dumps were taken at different instants: ${before.now}, ${after.now}`)
  const differences = diffSnapshots(before.congregations, after.congregations, ignoredKeys)
  for (const difference of differences.slice(0, 50)) {
    process.stdout.write(
      `${difference.path}\n  before: ${JSON.stringify(difference.before)}\n  after:  ${JSON.stringify(difference.after)}\n`,
    )
  }
  process.stdout.write(differences.length === 0 ? 'The same.\n' : `${differences.length} difference(s).\n`)
  return differences.length === 0
}

function optionValues(args: string[], name: string): string[] {
  return args.flatMap((arg, index) => (arg === name && args[index + 1] ? [args[index + 1]] : []))
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'dump' && args[0]) {
    const [now] = optionValues(args, '--now')
    if (!now) throw new Error('--now is required: both dumps must read at the same instant')
    await dump(args[0], new Date(now))
  } else if (command === 'compare' && args[0] && args[1]) {
    if (!compare(args[0], args[1], new Set(optionValues(args, '--ignore-key')))) process.exitCode = 1
  } else {
    process.stdout.write(
      'Usage: events-snapshot.ts dump <file.json> --now <ISO instant> | compare <before> <after> [--ignore-key k]\n',
    )
    process.exitCode = 2
  }
}

main()
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => unscopedDb.$disconnect())
