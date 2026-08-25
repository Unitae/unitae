import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { seedDefaultTemplates } from '../features/events/server/seed-templates.server'
import { seedBuiltInTerritoryKinds } from '../features/territories/server/territory-kinds.server'
import { seedBuiltInRoles, seedPermissions } from '../shared/domain/setup.server'
import { PrismaClient } from './generated/client'

const DEFAULT_SLUG = 'ma-congregation'

// Written by this seed before the domain was removed; kept only so existing
// installs are recognised rather than duplicated.
const LEGACY_PLACEHOLDER_DOMAIN = 'ma-congregation.example.com'

const adapter = new PrismaPg({ connectionString: process.env.DB_URL })
const prisma = new PrismaClient({ adapter })
async function main() {
  await seedPermissions(prisma)

  // Single-tenant installations: pre-create a default congregation with its
  // programme templates (which include the system `day-off` and `freeform`
  // templates). In multi-tenant mode, congregations are created through the
  // /register flow (registerCongregation), which already seeds templates for
  // each new tenant.
  if (process.env.UNITAE_MULTI_TENANT !== 'true') {
    const seedLocale = 'fr'

    // Match on either field: the slug is what this seed creates, but installs
    // seeded before this change carry the placeholder domain and may since have
    // been renamed. Upserting on slug alone would miss those and then collide
    // on the unique domain, which is how this script came to fail outright.
    const existing = await prisma.congregation.findFirst({
      where: { OR: [{ slug: DEFAULT_SLUG }, { domain: LEGACY_PLACEHOLDER_DOMAIN }] },
    })

    // No domain is set. It exists for multi-tenant custom-domain resolution and
    // means nothing single-tenant — but resolveCongregation reads it as the
    // highest-priority source for baseUrl, so a placeholder here sent every
    // email link and share message to a hostname that does not exist.
    // Leaving it null lets baseUrl fall through to UNITAE_BASE_URL.
    const defaultCongregation =
      existing ??
      (await prisma.congregation.create({
        data: { name: 'Ma Congrégation', slug: DEFAULT_SLUG },
      }))

    await seedDefaultTemplates(prisma, defaultCongregation.id, seedLocale)
    await seedBuiltInRoles(prisma, defaultCongregation.id)
    await seedBuiltInTerritoryKinds(prisma, defaultCongregation.id)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async e => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
