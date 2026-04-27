/**
 * Marketing seed — populates the database with realistic demo data for screenshots.
 *
 * Run after the regular seed:
 *   pnpm tsx app/database/seed-marketing.ts
 *
 * Creates a congregation "Ma Congrégation" with:
 * - 45 publishers (realistic French names, various roles/types)
 * - 5 publisher groups
 * - 18 territories with buildings & entrances
 * - 12 months of activity reports
 * - Board sections with documents
 * - Events with programme assignments
 * - Attributions (active + historical)
 */
import 'dotenv/config'
import { randomBytes, scrypt } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { EventKind } from '../features/events/model/event-kind.type'
import { ProgrammeTemplateKey } from '../features/events/model/programme-template.type'
import { seedDefaultTemplates } from '../features/events/server/seed-templates.server'
import { PublisherType } from '../shared/types/publisher-type'
import { Role } from '../shared/types/role'
import { PrismaClient } from './generated/client'

const adapter = new PrismaPg({ connectionString: process.env.DB_URL })
const prisma = new PrismaClient({ adapter })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex')
    scrypt(password, salt, 32, (error, derivedKey) => {
      if (error) reject(error)
      resolve(`${salt}.${derivedKey.toString('hex')}`)
    })
  })
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function monthsAgo(n: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const PUBLISHERS: {
  firstname: string
  lastname: string
  isMale: boolean
  type: string
  isHelder?: boolean
  isServant?: boolean
  email?: string
}[] = [
  // Elders
  {
    firstname: 'Marc',
    lastname: 'Dupont',
    isMale: true,
    type: PublisherType.Normal,
    isHelder: true,
  },
  {
    firstname: 'Jean-Pierre',
    lastname: 'Bernard',
    isMale: true,
    type: PublisherType.Normal,
    isHelder: true,
  },
  {
    firstname: 'Philippe',
    lastname: 'Martin',
    isMale: true,
    type: PublisherType.Normal,
    isHelder: true,
  },
  {
    firstname: 'Alain',
    lastname: 'Dubois',
    isMale: true,
    type: PublisherType.Normal,
    isHelder: true,
  },
  {
    firstname: 'Thierry',
    lastname: 'Moreau',
    isMale: true,
    type: PublisherType.Normal,
    isHelder: true,
  },
  // Servants
  {
    firstname: 'Nicolas',
    lastname: 'Laurent',
    isMale: true,
    type: PublisherType.Normal,
    isServant: true,
  },
  {
    firstname: 'David',
    lastname: 'Lefèvre',
    isMale: true,
    type: PublisherType.Normal,
    isServant: true,
  },
  {
    firstname: 'Sébastien',
    lastname: 'Roux',
    isMale: true,
    type: PublisherType.Normal,
    isServant: true,
  },
  {
    firstname: 'Julien',
    lastname: 'Girard',
    isMale: true,
    type: PublisherType.Normal,
    isServant: true,
  },
  // Regular pioneers
  {
    firstname: 'Marie',
    lastname: 'Dupont',
    isMale: false,
    type: PublisherType.PionnierPermanant,
  },
  {
    firstname: 'Sylvie',
    lastname: 'Bernard',
    isMale: false,
    type: PublisherType.PionnierPermanant,
  },
  {
    firstname: 'Patrick',
    lastname: 'Fontaine',
    isMale: true,
    type: PublisherType.PionnierPermanant,
  },
  {
    firstname: 'Céline',
    lastname: 'Morel',
    isMale: false,
    type: PublisherType.PionnierPermanant,
  },
  // Auxiliary pioneers
  {
    firstname: 'Nathalie',
    lastname: 'Martin',
    isMale: false,
    type: PublisherType.PionnierAuxiliaires,
  },
  {
    firstname: 'Sophie',
    lastname: 'Leroy',
    isMale: false,
    type: PublisherType.PionnierAuxiliaires,
  },
  {
    firstname: 'Christophe',
    lastname: 'Petit',
    isMale: true,
    type: PublisherType.PionnierAuxiliaires,
  },
  // Regular publishers
  {
    firstname: 'Isabelle',
    lastname: 'Moreau',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Catherine',
    lastname: 'Simon',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'François',
    lastname: 'Michel',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Éric',
    lastname: 'Garcia',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Sandrine',
    lastname: 'Thomas',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Laurent',
    lastname: 'Robert',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Valérie',
    lastname: 'Richard',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Pascal',
    lastname: 'Durand',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Stéphanie',
    lastname: 'Bonnet',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Olivier',
    lastname: 'Mercier',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Caroline',
    lastname: 'Lambert',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Antoine',
    lastname: 'Faure',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Émilie',
    lastname: 'Gauthier',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Bruno',
    lastname: 'Perrin',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Audrey',
    lastname: 'Clément',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Damien',
    lastname: 'Blanchard',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Karine',
    lastname: 'Guérin',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Jérôme',
    lastname: 'Muller',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Virginie',
    lastname: 'Fournier',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Frédéric',
    lastname: 'André',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Aurélie',
    lastname: 'Marchand',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Yannick',
    lastname: 'Picard',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Mélanie',
    lastname: 'Renaud',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Fabrice',
    lastname: 'Giraud',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Laetitia',
    lastname: 'Noel',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Benoît',
    lastname: 'Henry',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Delphine',
    lastname: 'Roussel',
    isMale: false,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Mathieu',
    lastname: 'Vincent',
    isMale: true,
    type: PublisherType.Normal,
  },
  {
    firstname: 'Camille',
    lastname: 'Masson',
    isMale: false,
    type: PublisherType.Normal,
  },
]

const TERRITORIES = [
  { number: 'T01', type: 'doors-to-doors', notes: 'Centre-ville, secteur piéton' },
  { number: 'T02', type: 'doors-to-doors', notes: '' },
  { number: 'T03', type: 'doors-to-doors', notes: 'Résidences récentes, beaucoup de jeunes familles' },
  { number: 'T04', type: 'doors-to-doors', notes: '' },
  { number: 'T05', type: 'doors-to-doors', notes: 'Quartier calme, peu de refus' },
  { number: 'T06', type: 'doors-to-doors', notes: '' },
  { number: 'T07', type: 'doors-to-doors', notes: 'Immeubles avec digicodes — voir notes entrées' },
  { number: 'T08', type: 'doors-to-doors', notes: '' },
  { number: 'T09', type: 'doors-to-doors', notes: '' },
  { number: 'T10', type: 'doors-to-doors', notes: 'Proche de la gare' },
  { number: 'T11', type: 'doors-to-doors', notes: '' },
  { number: 'T12', type: 'doors-to-doors', notes: 'Longue distance entre immeubles' },
  { number: 'T13', type: 'doors-to-doors', notes: '' },
  { number: 'T14', type: 'doors-to-doors', notes: '' },
  { number: 'P01', type: 'phone', notes: 'Territoire téléphonique — personnes âgées' },
  { number: 'P02', type: 'phone', notes: 'Territoire téléphonique' },
  { number: 'C01', type: 'doors-to-doors', notes: 'Commerces rue principale' },
  { number: 'C02', type: 'doors-to-doors', notes: 'Commerces zone commerciale' },
]

const STREETS = [
  { street: 'Rue de la République', zip: '75001' },
  { street: 'Avenue Victor Hugo', zip: '75001' },
  { street: 'Rue des Lilas', zip: '75001' },
  { street: 'Boulevard Pasteur', zip: '75001' },
  { street: 'Rue Jean Jaurès', zip: '75001' },
  { street: 'Place de la Mairie', zip: '75002' },
  { street: 'Rue du Commerce', zip: '75002' },
  { street: 'Rue de la Paix', zip: '75002' },
  { street: 'Allée des Peupliers', zip: '75002' },
  { street: 'Rue Voltaire', zip: '75002' },
  { street: 'Rue Émile Zola', zip: '75003' },
  { street: 'Rue des Jardins', zip: '75003' },
  { street: 'Avenue de la Gare', zip: '75003' },
  { street: 'Rue du Moulin', zip: '75003' },
  { street: 'Rue des Écoles', zip: '75003' },
  { street: 'Impasse des Cerisiers', zip: '75003' },
]

// visibleFrom/visibleUntil control board visibility. null = no bound.
const BOARD_SECTIONS = [
  {
    name: 'Informations générales',
    documents: [
      {
        title: 'Programme de la semaine',
        isHighlighted: true,
        visibleFrom: -7,
        visibleUntil: 7,
      },
      {
        title: 'Lettre du Collège central — Avril 2026',
        visibleFrom: -14,
        visibleUntil: null,
      },
      {
        title: 'Rappel : nettoyage de la Salle du Royaume',
        visibleFrom: -3,
        visibleUntil: 10,
      },
    ],
  },
  {
    name: 'Vie chrétienne et ministère',
    documents: [
      {
        title: 'Feuille de cantiques — Mai 2026',
        visibleFrom: -5,
        visibleUntil: 30,
      },
      {
        title: 'Programme des réunions — Mai 2026',
        isHighlighted: true,
        visibleFrom: -2,
        visibleUntil: 30,
      },
    ],
  },
  {
    name: 'Territoires',
    documents: [
      {
        title: 'Plan du territoire de la congrégation',
        visibleFrom: -60,
        visibleUntil: null,
      },
      {
        title: 'Consignes pour le porte-à-porte',
        visibleFrom: -30,
        visibleUntil: null,
      },
    ],
  },
  {
    name: 'Assemblées',
    documents: [
      {
        title: "Programme de l'assemblée de circonscription — Juin 2026",
        isHighlighted: true,
        visibleFrom: -1,
        visibleUntil: 60,
      },
      {
        title: 'Informations pratiques — Assemblée régionale 2026',
        visibleFrom: -10,
        visibleUntil: 90,
      },
      { title: "Plan d'accès au lieu d'assemblée" },
    ],
  },
] as const

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function cleanCongregationData(congregationId: number) {
  await prisma.programmeServiceRoleAssignment.deleteMany({
    where: { congregationId },
  })
  await prisma.programmePartAssignment.deleteMany({
    where: { congregationId },
  })
  await prisma.programmeTemplateResponsible.deleteMany({
    where: { congregationId },
  })
  await prisma.programmeTemplateServiceRole.deleteMany({
    where: { congregationId },
  })
  await prisma.programmeTemplatePart.deleteMany({ where: { congregationId } })
  await prisma.programmeTemplate.deleteMany({ where: { congregationId } })
  await prisma.event.deleteMany({ where: { congregationId } })
  await prisma.boardDynamicDocumentView.deleteMany({
    where: { settings: { congregationId } },
  })
  await prisma.boardDynamicDocumentSettings.deleteMany({
    where: { congregationId },
  })
  await prisma.boardDocumentVersion.deleteMany({ where: { congregationId } })
  await prisma.boardDocument.deleteMany({ where: { congregationId } })
  await prisma.boardSection.deleteMany({ where: { congregationId } })
  await prisma.publisherActivity.deleteMany({ where: { congregationId } })
  await prisma.attribution.deleteMany({ where: { congregationId } })
  await prisma.buildingResidentialData.deleteMany({
    where: { congregationId },
  })
  await prisma.buildingAccess.deleteMany({ where: { congregationId } })
  await prisma.buildingEntrance.deleteMany({ where: { congregationId } })
  await prisma.building.deleteMany({ where: { congregationId } })
  await prisma.territory.deleteMany({ where: { congregationId } })
  await prisma.congregationUserRole.deleteMany({ where: { congregationId } })
  await prisma.user.updateMany({
    where: { congregationId },
    data: { publisherGroupId: null },
  })
  await prisma.publisherGroup.deleteMany({ where: { congregationId } })
  await prisma.consentRecord.deleteMany({ where: { congregationId } })
  await prisma.setting.deleteMany({ where: { congregationId } })
  await prisma.eventKind.deleteMany({ where: { congregationId } })
  await prisma.dataDeletionRecord.deleteMany({ where: { congregationId } })
  await prisma.auditLog.deleteMany({ where: { congregationId } })
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: seed script — linear procedural data creation
async function main() {
  // biome-ignore lint/suspicious/noConsole: seed script
  console.log('🌱 Marketing seed: starting...')

  // ── Find target congregation ───────────────────────────────────────────
  // In single-tenant mode the regular seed creates "ma-congregation".
  // We reuse it so the marketing data is visible without switching tenant.
  const defaultCong = await prisma.congregation.findUnique({ where: { slug: 'ma-congregation' } })
  const marketingCong = await prisma.congregation.findUnique({ where: { slug: 'demo-congregation' } })

  // Clean up stale congregations from previous seed versions (e.g. "lyon-confluence")
  const staleSlugs = ['lyon-confluence']
  for (const slug of staleSlugs) {
    const stale = await prisma.congregation.findUnique({ where: { slug } })
    if (stale) {
      await cleanCongregationData(stale.id)
      await prisma.user.deleteMany({ where: { congregationId: stale.id } })
      await prisma.congregation.delete({ where: { id: stale.id } })
    }
  }

  // If both default and marketing exist, delete the marketing one (stale duplicate)
  if (defaultCong && marketingCong) {
    await cleanCongregationData(marketingCong.id)
    await prisma.user.deleteMany({ where: { congregationId: marketingCong.id } })
    await prisma.congregation.delete({ where: { id: marketingCong.id } })
  }

  const existing = defaultCong ?? marketingCong

  if (existing) {
    // biome-ignore lint/suspicious/noConsole: seed script
    console.log('  ⤵ Cleaning previous marketing data...')
    await cleanCongregationData(existing.id)
    await prisma.user.deleteMany({ where: { congregationId: existing.id } })
  }

  const hashedPassword = await hashPassword('demo1234')

  // ── Congregation ──────────────────────────────────────────────────────
  // Update the existing congregation with marketing branding, or create a new one
  const marketingData = {
    name: 'Ma Congrégation',
    slug: 'demo-congregation',
    displayName: 'Ma Congrégation',
    locale: 'fr',
    timezone: 'Europe/Paris',
  }
  const congregation = existing
    ? await prisma.congregation.update({
        where: { id: existing.id },
        data: marketingData,
      })
    : await prisma.congregation.create({
        data: { ...marketingData, domain: 'demo.unitae.app' },
      })
  const congId = congregation.id

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ Congregation "${congregation.name}" (id=${congId})`)

  // ── EventKinds ────────────────────────────────────────────────────────
  const offKind = await prisma.eventKind.upsert({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      key_congregationId: { key: EventKind.Off, congregationId: congId },
    },
    update: {},
    create: {
      name: 'Absence',
      color: '#cfcfcf',
      key: EventKind.Off,
      congregationId: congId,
    },
  })

  const meetingKind = await prisma.eventKind.upsert({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      key_congregationId: { key: EventKind.Meeting, congregationId: congId },
    },
    update: {},
    create: {
      name: 'Réunion',
      color: '#4f46e5',
      key: EventKind.Meeting,
      congregationId: congId,
    },
  })

  // ── Programme templates ───────────────────────────────────────────────
  await seedDefaultTemplates(prisma, congId, 'fr')

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log('  ✓ Event kinds & programme templates')

  // ── Users / Publishers ────────────────────────────────────────────────
  const createdUsers: {
    id: number
    firstname: string
    lastname: string
    isMale: boolean
    type: string
  }[] = []

  for (const pub of PUBLISHERS) {
    const email =
      pub.email ??
      `${pub.firstname
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')}.${pub.lastname
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')}@demo.unitae.app`

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        firstname: pub.firstname,
        lastname: pub.lastname,
        email,
        password: hashedPassword,
        active: true,
        isPublisher: true,
        type: pub.type,
        isMale: pub.isMale,
        isHelder: pub.isHelder ?? false,
        isServant: pub.isServant ?? false,
        birthDate: randomDate(new Date('1955-01-01'), new Date('2002-12-31')),
        baptismDate: randomDate(new Date('1975-01-01'), new Date('2024-06-30')),
        emailVerifiedAt: email === 'marc.dupont@demo.unitae.app' ? new Date() : null,
        congregationId: congId,
      },
    })

    createdUsers.push({
      id: user.id,
      firstname: pub.firstname,
      lastname: pub.lastname,
      isMale: pub.isMale,
      type: pub.type,
    })
  }

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ ${createdUsers.length} publishers`)

  // ── Roles ─────────────────────────────────────────────────────────────
  const adminRole = await prisma.userRole.findUnique({
    where: { key: Role.Admin },
  })
  const terrManagerRole = await prisma.userRole.findUnique({
    where: { key: Role.TerritoriesManager },
  })
  const terrViewerRole = await prisma.userRole.findUnique({
    where: { key: Role.TerritoriesViewer },
  })
  const boardUploaderRole = await prisma.userRole.findUnique({
    where: { key: Role.BoardUploader },
  })
  const boardValidatorRole = await prisma.userRole.findUnique({
    where: { key: Role.BoardValidator },
  })
  const pubManagerRole = await prisma.userRole.findUnique({
    where: { key: Role.PublisherManager },
  })
  const activityManagerRole = await prisma.userRole.findUnique({
    where: { key: Role.ActivityManager },
  })
  const programManagerRole = await prisma.userRole.findUnique({
    where: { key: Role.ProgramManager },
  })
  const settingsUserManagerRole = await prisma.userRole.findUnique({
    where: { key: Role.SettingsUserManager },
  })

  // First elder = admin with all management roles
  const mainAdmin = createdUsers[0]
  const rolesToAssign = [
    adminRole,
    terrManagerRole,
    boardUploaderRole,
    boardValidatorRole,
    pubManagerRole,
    activityManagerRole,
    programManagerRole,
    settingsUserManagerRole,
  ].filter(Boolean)

  for (const role of rolesToAssign) {
    if (!role) continue
    await prisma.congregationUserRole.upsert({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        userId_roleId_congregationId: {
          userId: mainAdmin.id,
          roleId: role.id,
          congregationId: congId,
        },
      },
      update: {},
      create: { userId: mainAdmin.id, roleId: role.id, congregationId: congId },
    })
  }

  // Other elders get territory viewer + board validator
  for (let i = 1; i < 5; i++) {
    for (const role of [terrViewerRole, boardValidatorRole]) {
      if (!role) continue
      await prisma.congregationUserRole.upsert({
        where: {
          // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
          userId_roleId_congregationId: {
            userId: createdUsers[i].id,
            roleId: role.id,
            congregationId: congId,
          },
        },
        update: {},
        create: {
          userId: createdUsers[i].id,
          roleId: role.id,
          congregationId: congId,
        },
      })
    }
  }

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log('  ✓ Role assignments')

  // ── Publisher Groups ──────────────────────────────────────────────────
  const groupNames = [
    { name: 'Groupe Centre', address: '15 Avenue Victor Hugo, 75001' },
    { name: 'Groupe Nord', address: '42 Rue de la République, 75001' },
    { name: 'Groupe Sud', address: '8 Rue de la Paix, 75002' },
    { name: 'Groupe Est', address: '3 Avenue de la Gare, 75003' },
    { name: 'Groupe Ouest', address: '22 Rue Jean Jaurès, 75001' },
  ]

  // Elders as group responsibles (first 5 elders)
  const elders = createdUsers.filter(u => u.isMale).slice(0, 5)
  const servants = createdUsers.filter(u => u.isMale).slice(5, 9)

  for (let i = 0; i < groupNames.length; i++) {
    const responsible = elders[i]
    const deputy = servants[i] ?? null

    const group = await prisma.publisherGroup.create({
      data: {
        name: groupNames[i].name,
        adress: groupNames[i].address,
        responsibleId: responsible.id,
        deputyId: deputy?.id ?? null,
        congregationId: congId,
      },
    })

    // Assign ~8 publishers per group
    const startIdx = i * 9
    const endIdx = Math.min(startIdx + 9, createdUsers.length)
    for (let j = startIdx; j < endIdx; j++) {
      await prisma.user.update({
        where: { id: createdUsers[j].id },
        data: { publisherGroupId: group.id },
      })
    }
  }

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ ${groupNames.length} publisher groups`)

  // ── Territories ───────────────────────────────────────────────────────
  const createdTerritories: { id: number; number: string }[] = []

  for (const terr of TERRITORIES) {
    const territory = await prisma.territory.create({
      data: {
        number: terr.number,
        type: terr.type,
        notes: terr.notes,
        congregationId: congId,
      },
    })
    createdTerritories.push({ id: territory.id, number: territory.number })
  }

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ ${createdTerritories.length} territories`)

  // ── Buildings & Entrances ─────────────────────────────────────────────
  let buildingCount = 0

  for (let tIdx = 0; tIdx < Math.min(14, createdTerritories.length); tIdx++) {
    const territory = createdTerritories[tIdx]
    const numBuildings = randomInt(4, 10)

    for (let b = 0; b < numBuildings; b++) {
      const streetInfo = STREETS[(tIdx * 3 + b) % STREETS.length]
      // Use territory index + building index to guarantee unique numbers per street
      const buildingNumber = String(tIdx * 10 + b * 2 + 1)

      const building = await prisma.building.create({
        data: {
          number: buildingNumber,
          street: streetInfo.street,
          zip: streetInfo.zip,
          active: true,
          inTerritory: true,
          prospectionDate: Math.random() > 0.3 ? randomDate(monthsAgo(6), new Date()) : null,
          congregationId: congId,
        },
      })

      const entrance = await prisma.buildingEntrance.create({
        data: {
          kind: 'residential',
          homes: randomInt(4, 35),
          phones: randomInt(0, 10),
          liberals: randomInt(0, 3),
          access: Math.random() > 0.5 ? randomInt(1, 3) : null,
          // biome-ignore lint/style/useNamingConvention: Prisma field name
          isPMR: Math.random() > 0.8,
          isOpenEarly: Math.random() > 0.7,
          isMailboxOpen: Math.random() > 0.4,
          territories: { connect: { id: territory.id } },
          buildings: { connect: { id: building.id } },
          congregationId: congId,
        },
      })

      await prisma.buildingResidentialData.create({
        data: {
          buildingId: building.id,
          entranceId: entrance.id,
          homes: entrance.homes,
          phones: entrance.phones,
          liberals: entrance.liberals,
          congregationId: congId,
        },
      })

      buildingCount++
    }
  }

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ ${buildingCount} buildings with entrances`)

  // ── Attributions (active + historical) ────────────────────────────────
  let attrCount = 0
  const publishers = createdUsers

  // Active attributions for ~60% of territories
  for (let i = 0; i < Math.floor(createdTerritories.length * 0.6); i++) {
    const territory = createdTerritories[i]
    const publisher = pick(publishers)
    const startDate = randomDate(monthsAgo(4), monthsAgo(1))
    const lateDate = new Date(startDate)
    lateDate.setMonth(lateDate.getMonth() + 4)

    await prisma.attribution.create({
      data: {
        type: 'default',
        publisherId: publisher.id,
        territoryId: territory.id,
        startDate,
        lateDate,
        congregationId: congId,
      },
    })
    attrCount++
  }

  // Historical (completed) attributions
  for (let i = 0; i < 25; i++) {
    const territory = pick(createdTerritories)
    const publisher = pick(publishers)
    const startDate = randomDate(monthsAgo(18), monthsAgo(5))
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + randomInt(2, 5))
    const lateDate = new Date(startDate)
    lateDate.setMonth(lateDate.getMonth() + 4)

    await prisma.attribution.create({
      data: {
        type: 'default',
        publisherId: publisher.id,
        territoryId: territory.id,
        startDate,
        endDate,
        lateDate,
        congregationId: congId,
      },
    })
    attrCount++
  }

  // Explicit attributions for Marc Dupont: one late, one on time
  const marcDupont = createdUsers[0]

  // Late attribution — started 6 months ago, lateDate already passed
  const lateStart = monthsAgo(6)
  const lateDatePast = new Date(lateStart)
  lateDatePast.setMonth(lateDatePast.getMonth() + 4)
  await prisma.attribution.create({
    data: {
      type: 'default',
      publisherId: marcDupont.id,
      territoryId: createdTerritories[0].id,
      startDate: lateStart,
      lateDate: lateDatePast,
      congregationId: congId,
    },
  })
  attrCount++

  // On-time attribution — started recently, lateDate well in the future
  const onTimeStart = monthsAgo(1)
  const lateDateFuture = new Date(onTimeStart)
  lateDateFuture.setMonth(lateDateFuture.getMonth() + 4)
  await prisma.attribution.create({
    data: {
      type: 'default',
      publisherId: marcDupont.id,
      territoryId: createdTerritories[1].id,
      startDate: onTimeStart,
      lateDate: lateDateFuture,
      congregationId: congId,
    },
  })
  attrCount++

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ ${attrCount} territory attributions`)

  // ── Publisher Activity (12 months) ────────────────────────────────────
  let activityCount = 0
  const now = new Date()

  for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
    const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1)
    const month = date.getMonth() + 1
    const year = date.getFullYear()

    for (const user of createdUsers) {
      // ~85% of publishers report each month
      if (Math.random() > 0.85) continue

      let hours: number | null = null
      if (user.type === PublisherType.PionnierPermanant) {
        hours = randomInt(45, 90)
      } else if (user.type === PublisherType.PionnierAuxiliaires) {
        hours = randomInt(25, 55)
      }

      await prisma.publisherActivity.create({
        data: {
          month,
          year,
          publisherId: user.id,
          hours,
          studies: Math.random() > 0.7 ? randomInt(1, 3) : 0,
          type: user.type,
          isPublisher: true,
          congregationId: congId,
        },
      })
      activityCount++
    }
  }

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ ${activityCount} activity reports (12 months)`)

  // ── Board Sections & Documents ────────────────────────────────────────
  let docCount = 0

  for (let sIdx = 0; sIdx < BOARD_SECTIONS.length; sIdx++) {
    const sectionDef = BOARD_SECTIONS[sIdx]
    const section = await prisma.boardSection.create({
      data: {
        name: sectionDef.name,
        order: sIdx + 1,
        congregationId: congId,
      },
    })

    for (let dIdx = 0; dIdx < sectionDef.documents.length; dIdx++) {
      const doc = sectionDef.documents[dIdx]
      const daysToDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() + days)
        return d
      }
      await prisma.boardDocument.create({
        data: {
          title: doc.title,
          sectionId: section.id,
          order: dIdx + 1,
          isHighlighted: 'isHighlighted' in doc ? doc.isHighlighted : false,
          visibleFrom: 'visibleFrom' in doc ? daysToDate(doc.visibleFrom) : null,
          visibleUntil: 'visibleUntil' in doc && doc.visibleUntil != null ? daysToDate(doc.visibleUntil) : null,
          createdAt: randomDate(monthsAgo(2), new Date()),
          congregationId: congId,
        },
      })
      docCount++
    }
  }

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ ${BOARD_SECTIONS.length} board sections, ${docCount} documents`)

  // ── Events (past meetings + upcoming + days off) ──────────────────────
  let eventCount = 0

  const midweekTemplate = await prisma.programmeTemplate.findFirst({
    where: { key: ProgrammeTemplateKey.MidweekMeeting, congregationId: congId },
    include: { parts: true, serviceRoles: true },
  })

  const weekendTemplate = await prisma.programmeTemplate.findFirst({
    where: { key: ProgrammeTemplateKey.WeekendMeeting, congregationId: congId },
    include: { parts: true, serviceRoles: true },
  })

  // Generate 8 weeks of meetings (past 4 + future 4)
  for (let weekOffset = -4; weekOffset < 4; weekOffset++) {
    const baseDate = new Date()
    baseDate.setDate(baseDate.getDate() + weekOffset * 7)

    // Midweek meeting (Tuesday 19:30)
    if (midweekTemplate) {
      const tuesday = new Date(baseDate)
      tuesday.setDate(tuesday.getDate() - ((tuesday.getDay() + 5) % 7)) // previous/next Tuesday
      tuesday.setHours(19, 30, 0, 0)

      const endTuesday = new Date(tuesday)
      endTuesday.setHours(21, 30, 0, 0)

      const event = await prisma.event.create({
        data: {
          name: 'Réunion de semaine',
          kindId: meetingKind.id,
          startDate: tuesday,
          endDate: endTuesday,
          templateId: midweekTemplate.id,
          createdById: mainAdmin.id,
          congregationId: congId,
        },
      })

      // Create part assignments
      for (const part of midweekTemplate.parts) {
        const assignee = pick(createdUsers)
        const needsAssistant = part.isVariable && Math.random() > 0.5
        await prisma.programmePartAssignment.create({
          data: {
            name: part.name,
            section: part.section,
            track: part.track,
            order: part.order,
            durationMin: part.durationMin,
            eventId: event.id,
            partId: part.id,
            assigneeId: assignee.id,
            assistantId: needsAssistant ? pick(createdUsers.filter(u => u.id !== assignee.id)).id : null,
            congregationId: congId,
          },
        })
      }

      // Create service role assignments
      for (const role of midweekTemplate.serviceRoles) {
        await prisma.programmeServiceRoleAssignment.create({
          data: {
            name: role.name,
            eventId: event.id,
            serviceRoleId: role.id,
            assigneeId: pick(createdUsers).id,
            congregationId: congId,
          },
        })
      }

      eventCount++
    }

    // Weekend meeting (Saturday 10:00)
    if (weekendTemplate) {
      const saturday = new Date(baseDate)
      saturday.setDate(saturday.getDate() + ((6 - saturday.getDay() + 7) % 7))
      saturday.setHours(10, 0, 0, 0)

      const endSaturday = new Date(saturday)
      endSaturday.setHours(12, 0, 0, 0)

      const event = await prisma.event.create({
        data: {
          name: 'Réunion du week-end',
          kindId: meetingKind.id,
          startDate: saturday,
          endDate: endSaturday,
          templateId: weekendTemplate.id,
          createdById: mainAdmin.id,
          congregationId: congId,
        },
      })

      for (const part of weekendTemplate.parts) {
        await prisma.programmePartAssignment.create({
          data: {
            name: part.name,
            section: part.section,
            track: part.track,
            order: part.order,
            durationMin: part.durationMin,
            eventId: event.id,
            partId: part.id,
            assigneeId: pick(createdUsers).id,
            congregationId: congId,
          },
        })
      }

      for (const role of weekendTemplate.serviceRoles) {
        await prisma.programmeServiceRoleAssignment.create({
          data: {
            name: role.name,
            eventId: event.id,
            serviceRoleId: role.id,
            assigneeId: pick(createdUsers).id,
            congregationId: congId,
          },
        })
      }

      eventCount++
    }
  }

  // Days off for a few publishers
  for (let i = 0; i < 6; i++) {
    const publisher = pick(createdUsers)
    const startDate = randomDate(monthsAgo(1), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + randomInt(1, 14))

    await prisma.event.create({
      data: {
        name: pick(['Vacances', 'Congé', 'Indisponible', 'Assemblée de circonscription']),
        kindId: offKind.id,
        startDate,
        endDate,
        createdById: publisher.id,
        congregationId: congId,
      },
    })
    eventCount++
  }

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`  ✓ ${eventCount} events with programme assignments`)

  // biome-ignore lint/suspicious/noConsole: seed script
  console.log('\n✅ Marketing seed complete!')
  // biome-ignore lint/suspicious/noConsole: seed script
  console.log(`   Login: marc.dupont@demo.unitae.app / demo1234`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async e => {
    // biome-ignore lint/suspicious/noConsole: seed script
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
