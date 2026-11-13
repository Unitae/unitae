import { beforeEach, describe, expect, it, vi } from 'vitest'

const finders = {
  userAccount: vi.fn(),
  member: vi.fn(),
  role: vi.fn(),
  attribution: vi.fn(),
  boardDocument: vi.fn(),
  boardDynamicDocumentSettings: vi.fn(),
  boardSection: vi.fn(),
  campaign: vi.fn(),
  pioneerEnrolment: vi.fn(),
  territory: vi.fn(),
  publisherGroup: vi.fn(),
  eventTemplate: vi.fn(),
  territoryCardOverlay: vi.fn(),
}

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: Object.fromEntries(Object.entries(finders).map(([model, findMany]) => [model, { findMany }])),
}))

const { findAuditEntityNames } = await import('./audit-entity-names.server')

beforeEach(() => {
  vi.resetAllMocks()
  for (const findMany of Object.values(finders)) findMany.mockResolvedValue([])
})

describe('findAuditEntityNames', () => {
  it('reads nothing for a page that names no object', async () => {
    const names = await findAuditEntityNames(42, [
      { entityType: null, entityId: null },
      { entityType: 'Congregation', entityId: 42 },
    ])

    expect(names.size).toBe(0)
    for (const findMany of Object.values(finders)) expect(findMany).not.toHaveBeenCalled()
  })

  it('names an account after its record, then its own name, then its address', async () => {
    finders.userAccount.mockResolvedValue([
      {
        id: 775,
        email: 'marc@example.test',
        firstname: null,
        lastname: null,
        member: { firstname: 'Marc', lastname: 'Dupont' },
      },
      { id: 776, email: 'anne@example.test', firstname: 'Anne', lastname: 'Petit', member: null },
      { id: 777, email: 'nobody@example.test', firstname: null, lastname: null, member: null },
    ])

    const names = await findAuditEntityNames(42, [
      { entityType: 'User', entityId: 775 },
      { entityType: 'UserAccount', entityId: 776 },
      { entityType: 'User', entityId: 777 },
    ])

    expect(names.get('User:775')).toBe('Marc DUPONT')
    expect(names.get('UserAccount:776')).toBe('Anne PETIT')
    expect(names.get('User:777')).toBe('nobody@example.test')
  })

  it('asks each kind of object once, within the congregation', async () => {
    await findAuditEntityNames(42, [
      { entityType: 'User', entityId: 775 },
      { entityType: 'UserAccount', entityId: 776 },
      { entityType: 'User', entityId: 775 },
    ])

    expect(finders.userAccount).toHaveBeenCalledTimes(1)
    expect(finders.userAccount.mock.calls[0][0].where).toEqual({ id: { in: [775, 776] }, congregationId: 42 })
  })

  it('names a built-in role in the reader’s language and a custom one by its name', async () => {
    finders.role.mockResolvedValue([
      { id: 1, key: 'admin', name: null },
      { id: 2, key: 'custom-carts', name: 'Chariots' },
    ])

    const names = await findAuditEntityNames(42, [
      { entityType: 'Role', entityId: 1 },
      { entityType: 'Role', entityId: 2 },
    ])

    expect(names.get('Role:1')).toBe('Administrateur')
    expect(names.get('Role:2')).toBe('Chariots')
  })

  it('names an attribution by its territory and an enrolment by its person', async () => {
    finders.attribution.mockResolvedValue([{ id: 9, territory: { number: 'T12' } }])
    finders.pioneerEnrolment.mockResolvedValue([{ id: 3, member: { firstname: 'Luc', lastname: 'Roux' } }])

    const names = await findAuditEntityNames(42, [
      { entityType: 'Attribution', entityId: 9 },
      { entityType: 'PioneerEnrolment', entityId: 3 },
    ])

    expect(names.get('Attribution:9')).toBe('T12')
    expect(names.get('PioneerEnrolment:3')).toBe('Luc ROUX')
  })

  it('names documents, sections, campaigns, territories, groups, templates and map zones by their own label', async () => {
    finders.boardDocument.mockResolvedValue([{ id: 1, title: 'Lettre du Collège central' }])
    finders.boardDynamicDocumentSettings.mockResolvedValue([{ id: 2, title: 'Programme' }])
    finders.boardSection.mockResolvedValue([{ id: 3, name: 'Informations générales' }])
    finders.campaign.mockResolvedValue([{ id: 4, name: 'Mémorial 2026' }])
    finders.territory.mockResolvedValue([{ id: 5, number: 'D015' }])
    finders.publisherGroup.mockResolvedValue([{ id: 6, name: 'CENTRE' }])
    finders.eventTemplate.mockResolvedValue([{ id: 7, name: 'Réunion de semaine' }])
    finders.territoryCardOverlay.mockResolvedValue([
      { id: 8, name: 'Parc' },
      { id: 9, name: null },
    ])

    const names = await findAuditEntityNames(42, [
      { entityType: 'BoardDocument', entityId: 1 },
      { entityType: 'BoardDynamicDocumentSettings', entityId: 2 },
      { entityType: 'BoardSection', entityId: 3 },
      { entityType: 'Campaign', entityId: 4 },
      { entityType: 'Territory', entityId: 5 },
      { entityType: 'PublisherGroup', entityId: 6 },
      { entityType: 'EventTemplate', entityId: 7 },
      { entityType: 'TerritoryCardOverlay', entityId: 8 },
      { entityType: 'TerritoryCardOverlay', entityId: 9 },
    ])

    expect(Object.fromEntries(names)).toEqual({
      'BoardDocument:1': 'Lettre du Collège central',
      'BoardDynamicDocumentSettings:2': 'Programme',
      'BoardSection:3': 'Informations générales',
      'Campaign:4': 'Mémorial 2026',
      'Territory:5': 'D015',
      'PublisherGroup:6': 'CENTRE',
      'EventTemplate:7': 'Réunion de semaine',
      'TerritoryCardOverlay:8': 'Parc',
    })
  })

  it('leaves out an object that is gone and a kind it cannot name', async () => {
    const names = await findAuditEntityNames(42, [
      { entityType: 'Member', entityId: 404 },
      { entityType: 'PioneerGoal', entityId: 5 },
    ])

    expect(finders.member).toHaveBeenCalledTimes(1)
    expect(names.size).toBe(0)
  })
})
