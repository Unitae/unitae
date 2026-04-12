import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '~/database/generated/client'
import { Role } from '~/features/authorization/model/roles.type'
import { EventKind } from '~/features/events/model/event-kind.type'
import { seedDefaultTemplates } from '~/features/events/server/seed-templates.server'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
async function main() {
  const _adminRole = await prisma.userRole.upsert({
    where: { key: Role.Admin },
    update: {
      description: "Peut administrer l'application",
    },
    create: {
      key: Role.Admin,
      description: "Peut administrer l'application",
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.BoardUploader },
    update: {
      description: "Peut téléverser de nouveaux documents sur le tableau d'affichage",
    },
    create: {
      key: Role.BoardUploader,
      description: "Peut téléverser de nouveaux documents sur le tableau d'affichage",
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.BoardValidator },
    update: {
      description: "Peut valider les documents sur le tableau d'affichage et les rendre visibles",
    },
    create: {
      key: Role.BoardValidator,
      description: "Peut valider les documents sur le tableau d'affichage et les rendre visibles",
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.TerritoriesViewer },
    update: {
      description: 'Peut voir les listes de territoires et les attributations',
    },
    create: {
      key: Role.TerritoriesViewer,
      description: 'Peut voir les listes de territoires et les attributations',
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.TerritoriesManager },
    update: {
      description: 'Peut gérer les territoires (créer, modifier, supprimer)',
    },
    create: {
      key: Role.TerritoriesManager,
      description: 'Peut gérer les territoires (créer, modifier, supprimer)',
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.SettingsUserManager },
    update: {
      description: 'Peut gérer les utilisateurs (créer, modifier, supprimer)',
    },
    create: {
      key: Role.SettingsUserManager,
      description: 'Peut gérer les utilisateurs (créer, modifier, supprimer)',
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.PublisherViewer },
    update: {
      description: 'Peut voir les proclamateurs',
    },
    create: {
      key: Role.PublisherViewer,
      description: 'Peut voir les proclamateurs',
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.PublisherManager },
    update: {
      description: 'Peut gérer les proclamateurs (créer, modifier, supprimer)',
    },
    create: {
      key: Role.PublisherManager,
      description: 'Peut gérer les proclamateurs (créer, modifier, supprimer)',
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.ActivityManager },
    update: {
      description: `Peut gérer l'activité des proclamateurs (modifier)`,
    },
    create: {
      key: Role.ActivityManager,
      description: `Peut gérer l'activité des proclamateurs (modifier)`,
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.ActivityViewer },
    update: {
      description: `Peut voir l'activité des proclamateurs`,
    },
    create: {
      key: Role.ActivityViewer,
      description: `Peut voir l'activité des proclamateurs`,
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.ProgramViewer },
    update: {
      description: `Peut voir les programmes de l'assemblée`,
    },
    create: {
      key: Role.ProgramViewer,
      description: `Peut voir les programmes de l'assemblée`,
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.ProgramManager },
    update: {
      description: `Peut gérer les programmes de l'assemblée (modifier)`,
    },
    create: {
      key: Role.ProgramManager,
      description: `Peut gérer les programmes de l'assemblée (modifier)`,
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.ProspectionViewer },
    update: {
      description: 'Peut voir les données de prospection du territoires',
    },
    create: {
      key: Role.ProspectionViewer,
      description: 'Peut voir les données de prospection du territoires',
    },
  })
  await prisma.userRole.upsert({
    where: { key: Role.ProspectionManager },
    update: {
      description: 'Peut gérer les données de prospection du territoires (modifier)',
    },
    create: {
      key: Role.ProspectionManager,
      description: 'Peut gérer les données de prospection du territoires (modifier)',
    },
  })

  // Create or get default congregation
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
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      key_congregationId: { key: EventKind.Off, congregationId: defaultCongregation.id },
    },
    update: {
      name: 'Absence',
      color: '#cfcfcf',
    },
    create: {
      name: 'Absence',
      color: '#cfcfcf',
      key: EventKind.Off,
      congregationId: defaultCongregation.id,
    },
  })

  // Seed default programme templates for all congregations
  const allCongregations = await prisma.congregation.findMany({ select: { id: true } })
  for (const congregation of allCongregations) {
    await seedDefaultTemplates(prisma, congregation.id)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async e => {
    // biome-ignore lint/suspicious/noConsole: seed script needs console
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
