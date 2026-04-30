import { EventKind } from '~/features/events/model/event-kind.type'
import * as m from '~/paraglide/messages'
import type { locales } from '~/paraglide/runtime'
import { Role } from '~/shared/types/role'

type Locale = (typeof locales)[number]

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [Role.Admin]: "Peut administrer l'application",
  [Role.BoardUploader]: "Peut téléverser de nouveaux documents sur le tableau d'affichage",
  [Role.BoardValidator]: "Peut valider les documents sur le tableau d'affichage et les rendre visibles",
  [Role.TerritoriesViewer]: 'Peut voir les listes de territoires et les attributations',
  [Role.TerritoriesManager]: 'Peut gérer les territoires (créer, modifier, supprimer)',
  [Role.ProspectionViewer]: 'Peut voir les données de prospection du territoires',
  [Role.ProspectionManager]: 'Peut gérer les données de prospection du territoires (modifier)',
  [Role.SettingsUserManager]: 'Peut gérer les utilisateurs (créer, modifier, supprimer)',
  [Role.PublisherViewer]: 'Peut voir les proclamateurs',
  [Role.PublisherManager]: 'Peut gérer les proclamateurs (créer, modifier, supprimer)',
  [Role.ActivityViewer]: `Peut voir l'activité des proclamateurs`,
  [Role.ActivityManager]: `Peut gérer l'activité des proclamateurs (modifier)`,
  [Role.ProgramViewer]: `Peut voir les programmes de l'assemblée`,
  [Role.ProgramManager]: `Peut gérer les programmes de l'assemblée (modifier)`,
}

/**
 * Ensure all 14 UserRole rows exist. Uses upsert so it is safe to call on every
 * setup / registration — existing roles are updated, missing ones are created.
 *
 * Called from setup (single-tenant), registration (multi-tenant), and the seed script.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
export async function seedRoles(db: any) {
  for (const [key, description] of Object.entries(ROLE_DESCRIPTIONS)) {
    await db.userRole.upsert({
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
    // biome-ignore lint/style/useNamingConvention: prisma compound key
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
