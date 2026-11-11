import { createHash } from 'node:crypto'
import { ourListContent, sharedContact } from '~/features/events/model/our-speaker'
import type {
  ContactMode,
  OurBrother,
  OurListContact,
  OurSpeakerListPage,
} from '~/features/events/model/our-speaker.type'
import { getLocale } from '~/i18n/paraglide/runtime'
import { getSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { getRoleDisplayName } from '~/shared/types/role'
import { formatPersonName } from '~/shared/utils/format-person-name'

// « Notre liste »: the candidates (members of the role chosen in Réglages, still in the congregation), what of each
// goes on the list, the two contacts at its head, and where it was sent.

/** The service committee's coordinator, a built-in post. */
const COORDINATOR_ROLE_KEY = 'coordinator'
/** A single-person role is held by its leader; the deputy stands in, then any member. */
const SEAT_ORDER = ['leader', 'deputy', 'member']

const MEMBER_SELECT = {
  id: true,
  firstname: true,
  lastname: true,
  phone: true,
  email: true,
  isHelder: true,
  isServant: true,
  updatedAt: true,
  ourSpeaker: {
    select: {
      onList: true,
      talks: true,
      note: true,
      phoneMode: true,
      phoneCustom: true,
      phone2: true,
      emailMode: true,
      emailCustom: true,
      email2: true,
      updatedAt: true,
    },
  },
} as const

type MemberRow = {
  id: number
  firstname: string
  lastname: string
  phone: string
  email: string
  isHelder: boolean
  isServant: boolean
  updatedAt: Date
  ourSpeaker: {
    onList: boolean
    talks: number[]
    note: string
    phoneMode: string
    phoneCustom: string
    phone2: string
    emailMode: string
    emailCustom: string
    email2: string
    updatedAt: Date
  } | null
}

const asMode = (mode: string | undefined): ContactMode => (mode === 'custom' || mode === 'hidden' ? mode : 'record')

function brotherOf(member: MemberRow): OurBrother {
  const entry = member.ourSpeaker
  const choice = {
    phoneMode: asMode(entry?.phoneMode),
    phoneCustom: entry?.phoneCustom ?? '',
    phone2: entry?.phone2 ?? '',
    emailMode: asMode(entry?.emailMode),
    emailCustom: entry?.emailCustom ?? '',
    email2: entry?.email2 ?? '',
  }
  const record = { phone: member.phone, email: member.email }
  return {
    memberId: member.id,
    name: formatPersonName(member),
    appointment: member.isHelder ? 'elder' : member.isServant ? 'servant' : null,
    onList: entry?.onList ?? false,
    talks: entry?.talks ?? [],
    note: entry?.note ?? '',
    record,
    ...choice,
    shared: sharedContact(choice, record),
  }
}

async function holdersOf(db: TransactionClient, congregationId: number, roleKey: string): Promise<MemberRow[]> {
  const seats = await db.memberRoleAssignment.findMany({
    where: { congregationId, role: { key: roleKey }, member: { leftAt: null, anonymizedAt: null } },
    select: { kind: true, member: { select: MEMBER_SELECT } },
  })
  const ordered = [...seats].sort((a, b) => SEAT_ORDER.indexOf(a.kind) - SEAT_ORDER.indexOf(b.kind))
  const seen = new Set<number>()
  return ordered.flatMap(seat => {
    if (seen.has(seat.member.id)) return []
    seen.add(seat.member.id)
    return [seat.member as MemberRow]
  })
}

/** The holder of a single-person role, as the list shows him: his shared contact when he is on it, else his record. */
function contactOf(member: MemberRow | undefined): OurListContact | null {
  if (!member) return null
  const brother = brotherOf(member)
  return {
    name: brother.name,
    phone: brother.shared.phones[0] ?? member.phone,
    email: brother.shared.emails[0] ?? member.email,
  }
}

export async function getOurSpeakerListPage(
  db: TransactionClient,
  congregationId: number,
): Promise<OurSpeakerListPage> {
  const [candidatesKey, responsibleKey] = await Promise.all([
    getSetting(db, CongregationSettingKey.ExternalSpeakersCandidatesRole, congregationId),
    getSetting(db, CongregationSettingKey.ExternalSpeakersResponsibleRole, congregationId),
  ])
  const keys = [candidatesKey, responsibleKey].filter((key): key is string => key != null)
  const roles =
    keys.length > 0
      ? await db.role.findMany({ where: { congregationId, key: { in: keys } }, select: { key: true, name: true } })
      : []
  const role = (key: string | undefined) => {
    const found = key == null ? undefined : roles.find(each => each.key === key)
    return found ? { key: found.key, name: getRoleDisplayName(found) } : null
  }
  const candidatesRole = role(candidatesKey)
  const responsibleRole = role(responsibleKey)

  const [candidates, coordinators, responsibles, recipients] = await Promise.all([
    candidatesRole ? holdersOf(db, congregationId, candidatesRole.key) : Promise.resolve([]),
    holdersOf(db, congregationId, COORDINATOR_ROLE_KEY),
    responsibleRole ? holdersOf(db, congregationId, responsibleRole.key) : Promise.resolve([]),
    db.speakerCongregation.findMany({
      where: { congregationId },
      select: {
        id: true,
        name: true,
        responsibleName: true,
        responsibleEmail: true,
        coordinatorName: true,
        coordinatorEmail: true,
        ourListSentAt: true,
        ourListSentManually: true,
        ourListSentDigest: true,
      },
    }),
  ])

  const locale = getLocale()
  const byName = (a: MemberRow, b: MemberRow) =>
    a.lastname.localeCompare(b.lastname, locale) || a.firstname.localeCompare(b.firstname, locale)
  const brothers = [...candidates].sort(byName).map(brotherOf)
  // « Modifiée le … »: when a brother on the list, or his record (which his shared contact may follow), was last edited.
  const changes = candidates
    .filter(member => member.ourSpeaker?.onList)
    .flatMap(member => [member.ourSpeaker?.updatedAt, member.updatedAt])
    .filter((date): date is Date => date != null)
  const changedAt = changes.length > 0 ? new Date(Math.max(...changes.map(date => date.getTime()))) : null

  const header = { coordinator: contactOf(coordinators[0]), responsible: contactOf(responsibles[0]) }
  const digest = createHash('sha256').update(ourListContent({ header, brothers })).digest('hex')
  return {
    candidatesRole,
    responsibleRole,
    header,
    brothers,
    recipients: recipients
      .map(each => ({
        speakerCongregationId: each.id,
        name: each.name,
        responsibleName: each.responsibleName,
        responsibleEmail: each.responsibleEmail,
        coordinatorName: each.coordinatorName,
        coordinatorEmail: each.coordinatorEmail,
        sentAt: each.ourListSentAt,
        sentManually: each.ourListSentManually,
        outdated: each.ourListSentAt == null || each.ourListSentDigest !== digest,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale)),
    changedAt,
    digest,
  }
}

/** How many brothers are on our list, for the page's tab: those ticked who are still candidates. */
export async function countOurList(db: TransactionClient, congregationId: number): Promise<number> {
  const key = await getSetting(db, CongregationSettingKey.ExternalSpeakersCandidatesRole, congregationId)
  if (key == null) return 0
  return db.ourSpeaker.count({
    where: {
      congregationId,
      onList: true,
      member: { leftAt: null, anonymizedAt: null, roleAssignments: { some: { role: { key } } } },
    },
  })
}
