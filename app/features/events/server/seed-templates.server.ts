import { ProgrammeTemplateKey } from '~/features/events/model/programme-template.type'

interface PartDefinition {
  name: string
  section: string
  order: number
  durationMin: number | null
  isVariable: boolean
}

interface ServiceRoleDefinition {
  name: string
  key: string
}

interface TemplateDefinition {
  name: string
  key: string
  weekDay: number | null
  isRecurring: boolean
  parts: PartDefinition[]
  serviceRoles: ServiceRoleDefinition[]
}

const sharedServiceRoles: ServiceRoleDefinition[] = [
  { name: 'Sono', key: 'sono' },
  { name: 'Estrade', key: 'stage' },
  { name: 'Accueil', key: 'welcome' },
  { name: 'Nettoyage', key: 'cleaning' },
]

const templates: TemplateDefinition[] = [
  {
    name: 'Réunion de semaine',
    key: ProgrammeTemplateKey.MidweekMeeting,
    weekDay: 2, // Tuesday
    isRecurring: true,
    parts: [
      { name: 'Cantique et prière', section: '', order: 1, durationMin: 5, isVariable: false },
      { name: 'Discours', section: 'Joyaux spirituels', order: 2, durationMin: 10, isVariable: true },
      {
        name: 'Recherchons des perles spirituelles',
        section: 'Joyaux spirituels',
        order: 3,
        durationMin: 10,
        isVariable: false,
      },
      { name: 'Lecture de la Bible', section: 'Joyaux spirituels', order: 4, durationMin: 4, isVariable: false },
      { name: '1re partie', section: 'Appliquons-nous au ministère', order: 5, durationMin: null, isVariable: true },
      { name: '2e partie', section: 'Appliquons-nous au ministère', order: 6, durationMin: null, isVariable: true },
      { name: '3e partie', section: 'Appliquons-nous au ministère', order: 7, durationMin: null, isVariable: true },
      { name: 'Cantique', section: '', order: 8, durationMin: 5, isVariable: false },
      { name: '1re partie', section: 'Vie chrétienne', order: 9, durationMin: null, isVariable: true },
      { name: '2e partie', section: 'Vie chrétienne', order: 10, durationMin: null, isVariable: true },
      {
        name: "Étude biblique de l'assemblée",
        section: 'Vie chrétienne',
        order: 11,
        durationMin: 30,
        isVariable: false,
      },
      { name: 'Cantique et prière de conclusion', section: '', order: 12, durationMin: 5, isVariable: false },
    ],
    serviceRoles: sharedServiceRoles,
  },
  {
    name: 'Réunion du week-end',
    key: ProgrammeTemplateKey.WeekendMeeting,
    weekDay: 6, // Saturday
    isRecurring: true,
    parts: [
      { name: 'Cantique et prière', section: '', order: 1, durationMin: 5, isVariable: false },
      { name: 'Discours public', section: '', order: 2, durationMin: 30, isVariable: true },
      { name: 'Cantique', section: '', order: 3, durationMin: 5, isVariable: false },
      { name: 'Étude de La Tour de Garde', section: '', order: 4, durationMin: 60, isVariable: false },
      { name: 'Cantique et prière de conclusion', section: '', order: 5, durationMin: 5, isVariable: false },
    ],
    serviceRoles: sharedServiceRoles,
  },
  {
    name: 'Mémorial',
    key: ProgrammeTemplateKey.Memorial,
    weekDay: null,
    isRecurring: false,
    parts: [
      { name: 'Cantique et prière', section: '', order: 1, durationMin: 5, isVariable: false },
      { name: 'Discours du Mémorial', section: '', order: 2, durationMin: 45, isVariable: true },
      { name: 'Prière sur le pain', section: '', order: 3, durationMin: null, isVariable: false },
      { name: 'Prière sur le vin', section: '', order: 4, durationMin: null, isVariable: false },
      { name: 'Cantique et prière de conclusion', section: '', order: 5, durationMin: 5, isVariable: false },
    ],
    serviceRoles: sharedServiceRoles,
  },
]

// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and unscoped db
export async function seedDefaultTemplates(db: any, congregationId: number) {
  for (const tpl of templates) {
    const existing = await db.programmeTemplate.findFirst({
      where: { key: tpl.key, congregationId },
    })

    if (existing) continue

    await db.programmeTemplate.create({
      data: {
        name: tpl.name,
        key: tpl.key,
        weekDay: tpl.weekDay,
        isRecurring: tpl.isRecurring,
        congregationId,
        parts: {
          create: tpl.parts.map(part => ({
            name: part.name,
            section: part.section,
            order: part.order,
            durationMin: part.durationMin,
            isVariable: part.isVariable,
            congregationId,
          })),
        },
        serviceRoles: {
          create: tpl.serviceRoles.map(role => ({
            name: role.name,
            key: role.key,
            congregationId,
          })),
        },
      },
    })
  }
}
