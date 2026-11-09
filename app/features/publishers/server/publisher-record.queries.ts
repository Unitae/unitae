import {
  ENROLMENT_MODES,
  enrolmentMonthOptions,
  enrolmentTypeOf,
} from '~/features/publishers/model/pioneer-enrolment-form'
import { toServiceYear } from '~/features/publishers/model/pioneer-pace'
import type { EnrolmentOptions } from '~/features/publishers/model/publisher-record.type'
import { getBoolSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { PublisherType } from '~/shared/types/publisher-type'

import { listPioneerGoalsForYear } from './pioneer-goals.queries'

const PERSON_NAME = { select: { id: true, firstname: true, lastname: true } } as const

export interface PersonName {
  id: number
  firstname: string
  lastname: string
}

/** What the publisher record shows about the person, whatever the reader's other rights. */
export interface PublisherRecord {
  id: number
  firstname: string
  lastname: string
  isMale: boolean | null
  birthDate: Date | null
  baptismDate: Date | null
  arrivedAt: Date | null
  lastPastoralVisitAt: Date | null
  phone: string
  email: string
  address: string
  isAnointed: boolean
  isHelder: boolean
  isServant: boolean
  isPublisher: boolean
  leftAt: Date | null
  inactiveAt: Date | null
  group: { id: number; name: string; responsible: PersonName; deputy: PersonName | null } | null
  /** Their login, for those who manage publishers; null for everyone else, and for someone without one. */
  login: { email: string } | null
}

/**
 * The publisher record's person, by name of every column it reads: reports, emergency flags and enrolments each have
 * their own read behind their own right, so none of them travels with the record. The group's leaders come by name
 * only. Null when nobody by that id belongs to the congregation.
 */
export async function getPublisherRecord(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  { withLogin }: { withLogin: boolean },
): Promise<PublisherRecord | null> {
  const row = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      isMale: true,
      birthDate: true,
      baptismDate: true,
      arrivedAt: true,
      lastPastoralVisitAt: true,
      phone: true,
      email: true,
      address: true,
      isAnointed: true,
      isHelder: true,
      isServant: true,
      isPublisher: true,
      leftAt: true,
      inactiveAt: true,
      publisherGroup: { select: { id: true, name: true, responsible: PERSON_NAME, deputy: PERSON_NAME } },
      account: withLogin ? { select: { email: true } } : false,
    },
  })
  if (row == null) return null

  const { publisherGroup, account, ...person } = row
  return { ...person, group: publisherGroup ?? null, login: account ?? null }
}

/**
 * What the record's enrolment dialogs offer: this month and the next, each with the congregation's auxiliary rate for
 * its own service year (the two can straddle September), the year's rate for every service, a span of years around
 * now, and whether the congregation uses permanent auxiliary pioneers. `now` is read on the congregation's calendar.
 */
export async function getEnrolmentOptions(
  db: TransactionClient,
  congregationId: number,
  now: Date,
): Promise<EnrolmentOptions> {
  const months = enrolmentMonthOptions(now)
  const current = toServiceYear(now.getMonth(), now.getFullYear())
  const serviceYears = [...new Set([current, ...months.map(option => toServiceYear(option.month, option.year))])]
  const goals = new Map(
    await Promise.all(serviceYears.map(async year => [year, await listPioneerGoalsForYear(db, year)] as const)),
  )
  const rate = (serviceYear: number, type: PublisherType) =>
    goals.get(serviceYear)?.find(goal => goal.type === type)?.effectiveRate ?? 0
  const permanentAuxiliary = await getBoolSetting(
    db,
    CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated,
    congregationId,
  )

  return {
    months: months.map(option => ({
      ...option,
      auxiliaryGoal: rate(toServiceYear(option.month, option.year), PublisherType.PionnierAuxiliaires),
    })),
    years: Array.from({ length: 5 }, (_, index) => now.getFullYear() - 2 + index),
    rates: Object.fromEntries(ENROLMENT_MODES.map(mode => [mode, rate(current, enrolmentTypeOf(mode))])) as Record<
      (typeof ENROLMENT_MODES)[number],
      number
    >,
    hidePermanentAuxiliary: !permanentAuxiliary,
  }
}
