import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { seedDefaultTemplates } from '../features/events/server/seed-templates.server'
import * as m from '../paraglide/messages'
import { seedRoles } from '../shared/domain/setup.server'
import { PrismaClient } from './generated/client'

const adapter = new PrismaPg({ connectionString: process.env.DB_URL })
const prisma = new PrismaClient({ adapter })
async function main() {
  await seedRoles(prisma)

  // Single-tenant installations: pre-create a default congregation with its
  // EventKind and programme templates. In multi-tenant mode, congregations
  // are created through the /register flow (registerCongregation), which
  // already seeds templates for each new tenant.
  if (process.env.UNITAE_MULTI_TENANT !== 'true') {
    const seedLocale = 'fr'

    const defaultCongregation = await prisma.congregation.upsert({
      where: { slug: 'ma-congregation' },
      update: {},
      create: {
        name: 'Ma Congrégation',
        slug: 'ma-congregation',
        domain: 'ma-congregation.example.com',
      },
    })

    await prisma.eventKind.upsert({
      where: {
        key_congregationId: { key: 'off', congregationId: defaultCongregation.id },
      },
      update: {
        name: m.seed_event_kind_absence({}, { locale: seedLocale }),
        color: '#cfcfcf',
      },
      create: {
        name: m.seed_event_kind_absence({}, { locale: seedLocale }),
        color: '#cfcfcf',
        key: 'off',
        congregationId: defaultCongregation.id,
      },
    })

    await seedDefaultTemplates(prisma, defaultCongregation.id, seedLocale)
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
