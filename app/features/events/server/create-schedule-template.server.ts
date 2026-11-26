import { ScheduleKind } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

/** « Nouveau modèle »: what it holds (parts or services), its name, and who answers for it (none: the managers). */
export interface NewScheduleTemplate {
  name: string
  kind: ScheduleKind
  responsibleRoleId: number | null
}

/**
 * Creates a schedule template from « Modèles de planning » (6a-1c-2): named, of parts or of services, with a responsible
 * the congregation may hand a template to, or none. No kind uses it yet: « Ajouter un planning » offers it on the
 * meetings, and its items are its own (template-owner.ts). Its main room comes with it (the ScheduleTemplate_rooms
 * trigger). Refused without a name, with one another template carries, or with a role it may not have.
 */
export async function createScheduleTemplate(
  db: TransactionClient,
  input: NewScheduleTemplate,
  congregationId: number,
  actorId: number,
): Promise<{ ok: true; id: number } | { ok: false; reason: 'name' | 'role' | 'taken' }> {
  const name = sanitizeText(input.name).trim()
  if (name === '') return { ok: false, reason: 'name' }
  if (await scheduleTemplateNameTaken(db, name, congregationId)) return { ok: false, reason: 'taken' }
  const { responsibleRoleId } = input
  if (responsibleRoleId != null) {
    const delegatable = (await listDelegatableRoles(db, congregationId)).some(role => role.id === responsibleRoleId)
    if (!delegatable) return { ok: false, reason: 'role' }
  }
  const kind = input.kind === ScheduleKind.Duty ? ScheduleKind.Duty : ScheduleKind.Programme
  const { id } = await db.scheduleTemplate.create({
    data: { name, kind, responsibleRoleId, congregationId },
    select: { id: true },
  })
  await auditInTransaction(db, {
    action: AuditAction.ScheduleTemplateCreated,
    congregationId,
    actorId,
    entityType: 'ScheduleTemplate',
    entityId: id,
    metadata: { name, kind, responsibleRoleId },
  })
  return { ok: true, id }
}

/**
 * Whether another schedule template reads as `name`: one carrying it, whatever the case or accents, or an unnamed one
 * whose label is it (« Spirituel », « Services », in the reader's language). Two templates of one name could not be told apart in
 * the list or in « Ajouter un planning » (user, 2026-11-26). `except` is the template being renamed.
 */
export async function scheduleTemplateNameTaken(
  db: TransactionClient,
  name: string,
  congregationId: number,
  except?: number,
): Promise<boolean> {
  const wanted = comparable(name)
  const others = await db.scheduleTemplate.findMany({
    where: { congregationId, ...(except != null && { NOT: { id: except } }) },
    select: { name: true, kind: true },
  })
  const label = (kind: string) =>
    kind === ScheduleKind.Duty ? m.programs_schedule_kind_duty() : m.programs_schedule_kind_programme()
  return others.some(other => comparable(other.name ?? label(other.kind)) === wanted)
}

/** A name as two names are told apart: neither case nor accents count (« Memorial » is « Mémorial », user). */
function comparable(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}
