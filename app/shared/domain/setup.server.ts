import { EventKind } from '~/features/events/model/event-kind.type'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import { Permission } from '~/shared/types/permission'

type Locale = (typeof locales)[number]

const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  [Permission.Admin]: "Peut administrer l'application",
  [Permission.BoardUploader]: "Peut téléverser de nouveaux documents sur le tableau d'affichage",
  [Permission.BoardValidator]: "Peut valider les documents sur le tableau d'affichage et les rendre visibles",
  [Permission.TerritoriesViewer]: 'Peut voir les listes de territoires et les attributations',
  [Permission.TerritoriesManager]: 'Peut gérer les territoires (créer, modifier, supprimer)',
  [Permission.ProspectionViewer]: 'Peut voir les données de prospection du territoires',
  [Permission.ProspectionManager]: 'Peut gérer les données de prospection du territoires (modifier)',
  [Permission.SettingsUserManager]: 'Peut gérer les utilisateurs (créer, modifier, supprimer)',
  [Permission.PublisherViewer]: 'Peut voir les proclamateurs',
  [Permission.PublisherManager]: 'Peut gérer les proclamateurs (créer, modifier, supprimer)',
  [Permission.ActivityViewer]: `Peut voir l'activité des proclamateurs`,
  [Permission.ActivityManager]: `Peut gérer l'activité des proclamateurs (modifier)`,
  [Permission.ProgramViewer]: `Peut voir les programmes de l'assemblée`,
  [Permission.ProgramManager]: `Peut gérer les programmes de l'assemblée (modifier)`,
  [Permission.ExternalSpeakerViewer]: 'Peut consulter le registre des orateurs externes',
  [Permission.ExternalSpeakerManager]: 'Peut gérer le registre des orateurs externes (créer, modifier, archiver)',
}

/**
 * Ensure all Permission rows exist. Uses upsert so it is safe to call on every
 * setup / registration — existing permissions are updated, missing ones are created.
 *
 * Called from setup (single-tenant), registration (multi-tenant), and the seed script.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
export async function seedPermissions(db: any) {
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await db.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    })
  }
}

// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
type SeedTemplatesFn = (db: any, congregationId: number, locale: Locale) => Promise<void>

/**
 * Seed the default event kinds for a newly created congregation.
 * Pass `seedTemplates` to also seed programme templates — the caller must supply
 * it to avoid a domain→feature dependency inversion.
 */
export async function seedCongregationDefaults(
  // biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
  db: any,
  congregationId: number,
  locale: Locale,
  seedTemplates: SeedTemplatesFn = async () => {},
) {
  await db.eventKind.upsert({
    where: { key_congregationId: { key: EventKind.Off, congregationId } },
    update: {},
    create: {
      name: m.seed_event_kind_absence({}, { locale }),
      key: EventKind.Off,
      color: '#cfcfcf',
      congregationId,
    },
  })

  await seedTemplates(db, congregationId, locale)
}
