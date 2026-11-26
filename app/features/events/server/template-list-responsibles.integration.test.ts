import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// The meeting types list names each type's responsibles as its schedule templates hold them (6b-1b): its first
// programme template's, then its first duties template's, whatever TemplateResponsible rows it still has. In a
// congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { getTemplates } = await import('./event-templates.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('getTemplates', () => {
  it('names the responsibles its schedule templates hold, not the rows of the kind', async () => {
    let read: Record<string, string[]> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `list-resp-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const role = async (name: string) =>
            (await tx.role.create({ data: { key: `${stamp}-${name}`, name, congregationId } })).id
          const [stale, programme, duties] = [await role('Ancien'), await role('Programme'), await role('Services')]
          const kind = async (name: string, roles: { programme: number | null; duty: number | null }) => {
            const id = (await tx.eventTemplate.create({ data: { name, key: `${stamp}-${name}`, congregationId } })).id
            // A row the page no longer follows.
            await tx.templateResponsible.create({ data: { templateId: id, roleId: stale, congregationId } })
            for (const [order, sort] of (['programme', 'duty'] as const).entries()) {
              const template = await tx.scheduleTemplate.create({
                data: { name: `${name} ${sort}`, kind: sort, responsibleRoleId: roles[sort], congregationId },
              })
              await tx.eventKindScheduleTemplate.create({
                data: { eventKindId: id, scheduleTemplateId: template.id, order, congregationId },
              })
            }
          }
          await kind('Both', { programme, duty: duties })
          await kind('None', { programme: null, duty: null })

          read = Object.fromEntries(
            (await getTemplates(db, congregationId)).map(each => [
              each.name,
              each.responsibles.map(responsible => responsible.name ?? ''),
            ]),
          )
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read).toEqual({ Both: ['Programme', 'Services'], None: [] })
  })
})
