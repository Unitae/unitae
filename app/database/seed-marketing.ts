/**
 * Demo seed — fills the demo congregation « Ma Congrégation » with coherent data for screenshots and local QA.
 *
 * Run after the regular seed:
 *   pnpm db:seed:marketing
 *
 * What it writes is `demo/seed-demo.ts`. It replaces the demo congregation's data, logins included: every login's
 * password is `demo1234`, and the main one is marc.dupont@demo.unitae.app.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { cleanCongregationData, seedDemoCongregation } from './demo/seed-demo'
import { PrismaClient } from './generated/client'

const adapter = new PrismaPg({ connectionString: process.env.DB_URL })
const prisma = new PrismaClient({ adapter })

/** The demo congregation, emptied: the one the regular seed creates in single-tenant mode, or a demo one. */
async function demoCongregation() {
  const defaultCong = await prisma.congregation.findUnique({ where: { slug: 'ma-congregation' } })
  const marketingCong = await prisma.congregation.findUnique({ where: { slug: 'demo-congregation' } })

  // Stale congregations from previous seed versions, and a duplicate demo one.
  const stale = [await prisma.congregation.findUnique({ where: { slug: 'lyon-confluence' } })]
  if (defaultCong && marketingCong) stale.push(marketingCong)
  for (const congregation of stale) {
    if (!congregation) continue
    await cleanCongregationData(prisma, congregation.id)
    await prisma.congregation.delete({ where: { id: congregation.id } })
  }

  const existing = defaultCong ?? marketingCong
  if (existing) {
    console.log('  ⤵ Cleaning previous demo data...')
    await cleanCongregationData(prisma, existing.id)
  }
  const data = {
    name: 'Ma Congrégation',
    slug: 'demo-congregation',
    displayName: 'Ma Congrégation',
    locale: 'fr',
    timezone: 'Europe/Paris',
  }
  return existing
    ? prisma.congregation.update({ where: { id: existing.id }, data })
    : prisma.congregation.create({ data: { ...data, domain: 'demo.unitae.app' } })
}

async function main() {
  console.log('🌱 Demo seed: starting...')
  const congregation = await demoCongregation()
  console.log(`  ✓ Congregation "${congregation.name}" (id=${congregation.id})`)
  await seedDemoCongregation(prisma, congregation, { log: line => console.log(line) })
  console.log('\n✅ Demo seed complete!')
  console.log('   Login: marc.dupont@demo.unitae.app / demo1234')
}

main()
  .catch(error => {
    console.error('❌ Demo seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
