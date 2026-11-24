import { ScheduleKind } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'

/** A schedule template as Réglages › « Modèles de planning » lists it (listScheduleTemplatesForSettings). */
export interface ListedScheduleTemplate {
  id: number
  name: string | null
  key: string | null
  kind: string
  items: number
  responsibleRole: { id: number; key: string; name: string | null } | null
  kinds: { id: number; name: string }[]
  schedules: number
}

/** What its row and its side panel show. */
export interface ScheduleTemplateView {
  id: number
  title: string
  /** « Spirituel · 15 parties », or « 4 services » where the title already says the kind. */
  detail: string
  responsible: string | null
  /** The kind suggesting it by name, how many when several, or none. */
  suggestedBy: string
  name: string
  /** Shown when the name is left blank: its kind's label, for a keyed template. */
  placeholder: string
  responsibleRoleId: number | null
  /** Its stored role when no one may pick it any more (an identity role from old data): shown, not offered. */
  storedRole: { id: number; label: string } | null
  /** Who holds its role today; null without a role. */
  holders: string[] | null
  kinds: string[]
  schedules: number
}

// A template left unnamed reads as its kind's label, as on the meeting's page.
const kindLabel = (kind: string) =>
  kind === ScheduleKind.Programme ? m.programs_view_spiritual_program() : m.programs_view_services()
const kindTag = (kind: string) =>
  kind === ScheduleKind.Programme ? m.programs_schedule_kind_programme() : m.programs_schedule_kind_duty()
const content = (kind: string, items: number) =>
  kind === ScheduleKind.Programme ? m.programs_new_parts({ count: items }) : m.programs_new_services({ count: items })

function suggestedBy(kinds: { name: string }[]): string {
  if (kinds.length === 0) return m.settings_schedule_templates_kinds_none()
  // One kind is named: after a rename it is the only way to tell which kind a programme template serves.
  if (kinds.length === 1) return kinds[0]?.name ?? ''
  return m.settings_schedule_templates_kinds({ count: kinds.length })
}

export function scheduleTemplateView(
  template: ListedScheduleTemplate,
  delegatable: { id: number; label: string }[],
  holders: ReadonlyMap<number, string[]>,
): ScheduleTemplateView {
  const title = template.name ?? kindLabel(template.kind)
  const tag = kindTag(template.kind)
  const role = template.responsibleRole
  const offered = role == null ? undefined : delegatable.find(each => each.id === role.id)
  const label = role == null ? null : (offered?.label ?? getRoleDisplayName(role))
  return {
    id: template.id,
    title,
    // The tag goes where the title already says the kind (« Services »), as on the meeting's page.
    detail: [...(tag === title ? [] : [tag]), content(template.kind, template.items)].join(' · '),
    responsible: label,
    suggestedBy: suggestedBy(template.kinds),
    name: template.name ?? '',
    placeholder: template.key == null ? '' : kindLabel(template.kind),
    responsibleRoleId: role?.id ?? null,
    storedRole: role != null && offered == null ? { id: role.id, label: label ?? '' } : null,
    holders: role == null ? null : (holders.get(role.id) ?? []),
    kinds: template.kinds.map(kind => kind.name),
    schedules: template.schedules,
  }
}
