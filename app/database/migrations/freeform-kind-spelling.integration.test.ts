import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// 20261203090000_freeform_kind_spelling: the built-in type seeded as « Autre événement » reads « Autre évènement », as
// « Types d’évènement » and the rest of the app write it. A name the congregation chose stays, and so does another
// language's; a second run changes nothing. Run on a rolled-back fixture.

const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DB_URL, max: 2, connectionTimeoutMillis: 5000 }),
})

const statements = readFileSync(
  join(import.meta.dirname, '20261203090000_freeform_kind_spelling', 'migration.sql'),
  'utf8',
)
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(Boolean)

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('freeform kind spelling', () => {
  it('renames the seeded French name only, and runs twice to the same result', async () => {
    let read: { names: string[]; again: string[]; events: string[] } | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `freeform-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregation = (name: string) =>
            tx.congregation.create({ data: { name: `${stamp}-${name}`, slug: `${stamp}-${name}`, active: true } })
          const [seeded, renamed, english] = [await congregation('a'), await congregation('b'), await congregation('c')]
          const kind = (congregationId: number, name: string) =>
            tx.eventTemplate.create({ data: { name, key: 'freeform', isRecurring: false, congregationId } })
          const ids = [
            (await kind(seeded.id, 'Autre événement')).id,
            (await kind(renamed.id, 'Évènements divers')).id,
            (await kind(english.id, 'Other event')).id,
          ]
          // A recurring type the congregation happened to name so: not the built-in one, left as it is.
          ids.push(
            (
              await tx.eventTemplate.create({
                data: { name: 'Autre événement', key: `${stamp}-own`, congregationId: seeded.id },
              })
            ).id,
          )
          const event = await tx.event.create({
            data: {
              name: 'Autre événement',
              startDate: new Date('2027-01-05T18:00:00Z'),
              endDate: new Date('2027-01-05T19:00:00Z'),
              templateId: ids[0],
              congregationId: seeded.id,
            },
          })
          const names = async () =>
            (await tx.eventTemplate.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })).map(
              each => each.name,
            )
          for (const statement of statements) await tx.$executeRawUnsafe(statement)
          const once = await names()
          for (const statement of statements) await tx.$executeRawUnsafe(statement)
          read = {
            names: once,
            again: await names(),
            events: [(await tx.event.findUniqueOrThrow({ where: { id: event.id } })).name],
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read?.names).toEqual(['Autre évènement', 'Évènements divers', 'Other event', 'Autre événement'])
    expect(read?.again).toEqual(read?.names)
    // A meeting keeps the name it was given.
    expect(read?.events).toEqual(['Autre événement'])
  })
})
