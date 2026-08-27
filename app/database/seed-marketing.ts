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
 * - Events with parts and service roles
 * - Attributions (active + historical)
 */
import 'dotenv/config'
import { randomBytes, scrypt } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { EventTemplateKey } from '../features/events/model/event-template.type'
import { seedDefaultTemplates } from '../features/events/server/seed-templates.server'
import { EntranceKind } from '../features/territories/model/entrance-kind.type'
import { TerritoryAttributionKind } from '../features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '../features/territories/model/territory-kind.type'
import { seedBuiltInTerritoryKinds } from '../features/territories/server/territory-kinds.server'
import { syncBuiltInRoleAssignments } from '../shared/domain/built-in-roles.server'
import { ensureAdminRole, seedBuiltInRoles } from '../shared/domain/setup.server'
import { Permission } from '../shared/types/permission'
import { PublisherType } from '../shared/types/publisher-type'
import { stripDiacritics } from '../shared/utils/strip-diacritics'
import { PrismaClient } from './generated/client'

const adapter = new PrismaPg({ connectionString: process.env.DB_URL })
const prisma = new PrismaClient({ adapter })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Hand-mirrors app/shared/auth/crypto.server.ts so seeded demo logins verify through the shared
// `compare`: current scrypt parameters (N=2^17), raised maxmem, self-describing storage format.
// This standalone seed script can't import server-only modules, so the params/format are
// duplicated here — keep them in sync by hand if CURRENT_PARAMS ever changes (not enforced).
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex')
    scrypt(password, salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(`scrypt$131072$8$1$${salt}$${derivedKey.toString('hex')}`)
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
  type: PublisherType
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

const TERRITORIES: { number: string; type: TerritoryKindKey; notes: string }[] = [
  { number: 'T01', type: TerritoryKindKey.Classical, notes: 'Centre-ville, secteur piéton' },
  { number: 'T02', type: TerritoryKindKey.Classical, notes: '' },
  { number: 'T03', type: TerritoryKindKey.Classical, notes: 'Résidences récentes, beaucoup de jeunes familles' },
  { number: 'T04', type: TerritoryKindKey.Classical, notes: '' },
  { number: 'T05', type: TerritoryKindKey.Classical, notes: 'Quartier calme, peu de refus' },
  { number: 'T06', type: TerritoryKindKey.Classical, notes: '' },
  { number: 'T07', type: TerritoryKindKey.Classical, notes: 'Immeubles avec digicodes — voir notes entrées' },
  { number: 'T08', type: TerritoryKindKey.Classical, notes: '' },
  { number: 'T09', type: TerritoryKindKey.Classical, notes: '' },
  { number: 'T10', type: TerritoryKindKey.Classical, notes: 'Proche de la gare' },
  { number: 'T11', type: TerritoryKindKey.Classical, notes: '' },
  { number: 'T12', type: TerritoryKindKey.Classical, notes: 'Longue distance entre immeubles' },
  { number: 'T13', type: TerritoryKindKey.Classical, notes: '' },
  { number: 'T14', type: TerritoryKindKey.Classical, notes: '' },
  { number: 'P01', type: TerritoryKindKey.Phone, notes: 'Territoire téléphonique — personnes âgées' },
  { number: 'P02', type: TerritoryKindKey.Phone, notes: 'Territoire téléphonique' },
  { number: 'C01', type: TerritoryKindKey.Commerces, notes: 'Commerces rue principale' },
  { number: 'C02', type: TerritoryKindKey.Commerces, notes: 'Commerces zone commerciale' },
  { number: 'H01', type: TerritoryKindKey.Hotel, notes: 'Hôtels du quartier' },
  { number: 'U01', type: TerritoryKindKey.Univ, notes: 'Campus universitaire' },
]

const ENTRANCE_KIND_FOR_TERRITORY: Record<TerritoryKindKey, EntranceKind> = {
  [TerritoryKindKey.Classical]: EntranceKind.Residential,
  [TerritoryKindKey.Phone]: EntranceKind.Residential,
  [TerritoryKindKey.Commerces]: EntranceKind.Commerce,
  [TerritoryKindKey.Hotel]: EntranceKind.Hotel,
  [TerritoryKindKey.Univ]: EntranceKind.Campus,
}

const SHOP_KINDS = [
  'boulangerie',
  'pharmacie',
  'restaurant',
  'épicerie',
  'café',
  'librairie',
  'tabac',
  'fleuriste',
  'coiffeur',
  'opticien',
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

// Approximate Paris arrondissement centers for the demo zips. Buildings get a
// small per-row jitter around their zip's center so markers spread realistically
// and the territory edit map has something clickable.
const ZIP_CENTERS: Record<string, { lat: number; lng: number }> = {
  '75001': { lat: 48.8638, lng: 2.336 },
  '75002': { lat: 48.8678, lng: 2.3413 },
  '75003': { lat: 48.8634, lng: 2.3601 },
}

function jitterCoord(zip: string): { latitude: number; longitude: number } {
  const center = ZIP_CENTERS[zip] ?? { lat: 48.8566, lng: 2.3522 }
  // ~330m radius — enough to spread within a neighbourhood, not enough to leave it.
  return {
    latitude: center.lat + (Math.random() * 0.006 - 0.003),
    longitude: center.lng + (Math.random() * 0.006 - 0.003),
  }
}

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
  await prisma.eventServicePart.deleteMany({
    where: { congregationId },
  })
  await prisma.eventPart.deleteMany({
    where: { congregationId },
  })
  await prisma.templateResponsible.deleteMany({
    where: { congregationId },
  })
  await prisma.templateServicePart.deleteMany({
    where: { congregationId },
  })
  await prisma.templatePart.deleteMany({ where: { congregationId } })
  await prisma.eventTemplate.deleteMany({ where: { congregationId } })
  // After the parts that point at them, before the congregation itself: the
  // FK to Congregation restricts, so leaving these behind makes the final
  // congregation.delete fail.
  await prisma.partPreset.deleteMany({ where: { congregationId } })
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
  await prisma.userRoleAssignment.deleteMany({ where: { congregationId } })
  await prisma.rolePermission.deleteMany({ where: { congregationId } })
  await prisma.role.deleteMany({ where: { congregationId, isBuiltIn: false } })
  await prisma.member.updateMany({
    where: { congregationId },
    data: { publisherGroupId: null },
  })
  await prisma.publisherGroup.deleteMany({ where: { congregationId } })
  await prisma.consentRecord.deleteMany({ where: { congregationId } })
  await prisma.setting.deleteMany({ where: { congregationId } })
  await prisma.dataDeletionRecord.deleteMany({ where: { congregationId } })
  await prisma.auditLog.deleteMany({ where: { congregationId } })
}

async function main() {
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
      await prisma.userAccount.deleteMany({ where: { congregationId: stale.id } })
      await prisma.member.deleteMany({ where: { congregationId: stale.id } })
      await prisma.congregation.delete({ where: { id: stale.id } })
    }
  }

  // If both default and marketing exist, delete the marketing one (stale duplicate)
  if (defaultCong && marketingCong) {
    await cleanCongregationData(marketingCong.id)
    await prisma.userAccount.deleteMany({ where: { congregationId: marketingCong.id } })
    await prisma.member.deleteMany({ where: { congregationId: marketingCong.id } })
    await prisma.congregation.delete({ where: { id: marketingCong.id } })
  }

  const existing = defaultCong ?? marketingCong

  if (existing) {
    console.log('  ⤵ Cleaning previous marketing data...')
    await cleanCongregationData(existing.id)
    await prisma.userAccount.deleteMany({ where: { congregationId: existing.id } })
    await prisma.member.deleteMany({ where: { congregationId: existing.id } })
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

  console.log(`  ✓ Congregation "${congregation.name}" (id=${congId})`)

  // Ensure built-in identity roles (`member`, `publisher`, `brother`, …) exist
  // for this congregation even when the marketing seed runs on a fresh DB
  // without the regular seed having run first.
  await seedBuiltInRoles(prisma, congId)
  await seedBuiltInTerritoryKinds(prisma, congId)

  // ── Event templates ───────────────────────────────────────────────────
  await seedDefaultTemplates(prisma, congId, 'fr')

  const dayOffTemplate = await prisma.eventTemplate.findFirstOrThrow({
    where: { key: EventTemplateKey.DayOff, congregationId: congId },
  })

  console.log('  ✓ Event templates')

  // ── Users / Publishers ────────────────────────────────────────────────
  // `id` = Member id (used as publisherId/assigneeId everywhere); `accountId` =
  // UserAccount id (used as userId in CongregationUserPermission). They differ
  // for fresh seeds because Prisma assigns each table its own sequence.
  const createdUsers: {
    id: number
    accountId: number
    firstname: string
    lastname: string
    isMale: boolean
    type: PublisherType
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

    const member = await prisma.member.create({
      data: {
        firstname: pub.firstname,
        lastname: pub.lastname,
        firstnameNormalized: stripDiacritics(pub.firstname),
        lastnameNormalized: stripDiacritics(pub.lastname),
        isPublisher: true,
        type: pub.type,
        isMale: pub.isMale,
        isHelder: pub.isHelder ?? false,
        isServant: pub.isServant ?? false,
        birthDate: randomDate(new Date('1955-01-01'), new Date('2002-12-31')),
        baptismDate: randomDate(new Date('1975-01-01'), new Date('2024-06-30')),
        congregationId: congId,
      },
    })

    // Populate MemberRoleAssignment rows from the member's flags. The regular
    // aggregate does this via syncBuiltInRoleAssignments; the direct
    // prisma.member.create above bypasses it, so call it explicitly here.
    await syncBuiltInRoleAssignments(prisma, member.id, congId, null)

    const account = await prisma.userAccount.upsert({
      where: { email },
      update: {},
      create: {
        memberId: member.id,
        email,
        password: hashedPassword,
        active: true,
        emailVerifiedAt: email === 'marc.dupont@demo.unitae.app' ? new Date() : null,
        congregationId: congId,
      },
    })

    createdUsers.push({
      id: member.id,
      accountId: account.id,
      firstname: pub.firstname,
      lastname: pub.lastname,
      isMale: pub.isMale,
      type: pub.type,
    })
  }

  console.log(`  ✓ ${createdUsers.length} publishers`)

  // ── Roles ─────────────────────────────────────────────────────────────
  const terrViewerRole = await prisma.permission.findUnique({
    where: { key: Permission.TerritoriesViewer },
  })
  const boardValidatorRole = await prisma.permission.findUnique({
    where: { key: Permission.BoardValidator },
  })

  // First elder = admin with all management roles
  const mainAdmin = createdUsers[0]
  // Permissions travel through roles only, and a role is a job, not a permission.
  // The demo therefore shows the two shapes a real congregation uses: the `admin`
  // system role for whoever runs the place, and one purpose-named custom role
  // bundling what the other elders actually do.
  async function assignRole(accountId: number, roleId: number) {
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: accountId, roleId } },
      update: {},
      create: { userId: accountId, roleId, congregationId: congId },
    })
  }

  // Admin implies every permission (see resolveEffectivePermissions), so the main
  // admin needs this role and nothing else.
  const adminRoleId = await ensureAdminRole(prisma, congId)
  if (adminRoleId != null) await assignRole(mainAdmin.accountId, adminRoleId)

  const territoryTeamRole = await prisma.role.upsert({
    where: { key_congregationId: { key: 'territory-team', congregationId: congId } },
    update: {},
    create: { key: 'territory-team', name: 'Équipe territoires', isBuiltIn: false, congregationId: congId },
    select: { id: true },
  })
  for (const permission of [terrViewerRole, boardValidatorRole]) {
    if (!permission) continue
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: territoryTeamRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: territoryTeamRole.id, permissionId: permission.id, congregationId: congId },
    })
  }
  for (let i = 1; i < 5; i++) {
    await assignRole(createdUsers[i].accountId, territoryTeamRole.id)
  }

  console.log('  ✓ Permission assignments')

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
      await prisma.member.update({
        where: { id: createdUsers[j].id },
        data: { publisherGroupId: group.id },
      })
    }
  }

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

  console.log(`  ✓ ${createdTerritories.length} territories`)

  // ── Buildings & Entrances ─────────────────────────────────────────────
  let buildingCount = 0

  for (let tIdx = 0; tIdx < createdTerritories.length; tIdx++) {
    const territory = createdTerritories[tIdx]
    const territoryDef = TERRITORIES[tIdx]
    const entranceKind = ENTRANCE_KIND_FOR_TERRITORY[territoryDef.type]
    const numBuildings = randomInt(4, 10)

    for (let b = 0; b < numBuildings; b++) {
      const streetInfo = STREETS[(tIdx * 3 + b) % STREETS.length]
      // Use territory index + building index to guarantee unique numbers per street
      const buildingNumber = String(tIdx * 10 + b * 2 + 1)

      const coords = jitterCoord(streetInfo.zip)

      const building = await prisma.building.create({
        data: {
          number: buildingNumber,
          street: streetInfo.street,
          streetNormalized: stripDiacritics(streetInfo.street),
          zip: streetInfo.zip,
          latitude: coords.latitude,
          longitude: coords.longitude,
          active: true,
          inTerritory: true,
          prospectionDate: Math.random() > 0.3 ? randomDate(monthsAgo(6), new Date()) : null,
          congregationId: congId,
        },
      })

      const isResidential = entranceKind === EntranceKind.Residential
      const homes = isResidential ? randomInt(4, 35) : null
      const phones = isResidential ? randomInt(0, 10) : null
      const liberals = isResidential ? randomInt(0, 3) : null

      const entrance = await prisma.buildingEntrance.create({
        data: {
          kind: entranceKind,
          shopKind: entranceKind === EntranceKind.Commerce ? pick(SHOP_KINDS) : '',
          homes,
          phones,
          liberals,
          access: Math.random() > 0.5 ? randomInt(1, 3) : null,
          isPMR: Math.random() > 0.8,
          isOpenEarly: Math.random() > 0.7,
          isMailboxOpen: Math.random() > 0.4,
          latitude: coords.latitude,
          longitude: coords.longitude,
          territories: { connect: { id: territory.id } },
          buildings: { connect: { id: building.id } },
          congregationId: congId,
        },
      })

      if (isResidential) {
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
      }

      buildingCount++
    }
  }

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
        type: TerritoryAttributionKind.Default,
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
        type: TerritoryAttributionKind.Default,
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
      type: TerritoryAttributionKind.Default,
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
      type: TerritoryAttributionKind.Default,
      publisherId: marcDupont.id,
      territoryId: createdTerritories[1].id,
      startDate: onTimeStart,
      lateDate: lateDateFuture,
      congregationId: congId,
    },
  })
  attrCount++

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

  console.log(`  ✓ ${BOARD_SECTIONS.length} board sections, ${docCount} documents`)

  // ── Events (past meetings + upcoming + days off) ──────────────────────
  let eventCount = 0

  const midweekTemplate = await prisma.eventTemplate.findFirst({
    where: { key: EventTemplateKey.MidweekMeeting, congregationId: congId },
    include: { parts: true, serviceParts: true },
  })

  const weekendTemplate = await prisma.eventTemplate.findFirst({
    where: { key: EventTemplateKey.WeekendMeeting, congregationId: congId },
    include: { parts: true, serviceParts: true },
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
          startDate: tuesday,
          endDate: endTuesday,
          templateId: midweekTemplate.id,
          createdById: mainAdmin.accountId,
          congregationId: congId,
        },
      })

      // Create part assignments
      for (const part of midweekTemplate.parts) {
        const assignee = pick(createdUsers)
        const needsAssistant = !part.durationMin && Math.random() > 0.5
        await prisma.eventPart.create({
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
      for (const role of midweekTemplate.serviceParts) {
        await prisma.eventServicePart.create({
          data: {
            name: role.name,
            eventId: event.id,
            servicePartId: role.id,
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
          startDate: saturday,
          endDate: endSaturday,
          templateId: weekendTemplate.id,
          createdById: mainAdmin.accountId,
          congregationId: congId,
        },
      })

      for (const part of weekendTemplate.parts) {
        await prisma.eventPart.create({
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

      for (const role of weekendTemplate.serviceParts) {
        await prisma.eventServicePart.create({
          data: {
            name: role.name,
            eventId: event.id,
            servicePartId: role.id,
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
        templateId: dayOffTemplate.id,
        startDate,
        endDate,
        createdById: publisher.accountId,
        congregationId: congId,
        // Match production: createDayOff bypasses the release workflow.
        status: 'released',
      },
    })
    eventCount++
  }

  console.log(`  ✓ ${eventCount} events with parts and service roles`)

  console.log('\n✅ Marketing seed complete!')
  console.log(`   Login: marc.dupont@demo.unitae.app / demo1234`)
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
