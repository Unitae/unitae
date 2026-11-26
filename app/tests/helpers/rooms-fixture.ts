import { addTemplateRoom, setTemplatePartRooms } from '~/features/events/index.server'
import { createProgrammeOnDay } from '~/features/events/server/programme-creation.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Two meetings of one kind whose first part is held in « Salle principale » and « Salle B », a speaker in each (and a
 * second speaker in each when `seconds` names one):
 * `copies` as the app writes it today (an item per room), `rows` as R4 will (one item, a row per room). Every reader
 * moving to `partsInRooms` must show them alike. The kind and its programme template must exist (seedDefaultTemplates
 * and syncTemplateScheduleTemplates); the people are the caller's. The `rows` meeting is for reading only until R4:
 * the item's trigger still moves its one room row on a write of its people, conflict or track, and with two rows
 * that write fails on their unique (item, room).
 */
export async function seedMeetingsInRooms(
  db: TransactionClient,
  input: {
    kindId: number
    days: [string, string]
    speakers: [number, number]
    /** A second speaker per room, when the test needs one. */
    seconds?: [number | null, number | null]
  },
  ctx: { congregationId: number; actorId: number; timezone?: string },
) {
  const { congregationId, actorId } = ctx
  const first = await db.templatePart.findFirstOrThrow({
    where: { templateId: input.kindId, congregationId, scheduleTemplateId: { not: null } },
    orderBy: { order: 'asc' },
  })
  const scheduleTemplateId = first.scheduleTemplateId as number
  const added = await addTemplateRoom(db, scheduleTemplateId, 'Salle B', congregationId, actorId)
  if (added.outcome !== 'added') throw new Error(`Salle B not added: ${added.outcome}`)
  await setTemplatePartRooms(db, scheduleTemplateId, first.id, [added.id], congregationId)

  const meeting = async (day: string) => {
    const event = await createProgrammeOnDay(
      db,
      { templateId: input.kindId, day },
      { congregationId, timezone: ctx.timezone ?? 'Europe/Paris', actorId },
    )
    const copies = await db.item.findMany({
      where: { eventId: event.id, name: first.name, schedule: { kind: 'programme' } },
      orderBy: { trackOrder: 'asc' },
    })
    if (copies.length !== 2) throw new Error(`expected two copies, got ${copies.length}`)
    for (const [index, copy] of copies.entries()) {
      await db.item.update({
        where: { id: copy.id },
        data: { assigneeId: input.speakers[index], assistantId: input.seconds?.[index] ?? null },
      })
    }
    return { eventId: event.id, copies }
  }

  const copies = await meeting(input.days[0])
  // The same meeting in R4's shape: the second room's row on the main room's item, then its copy gone.
  const rows = await meeting(input.days[1])
  const [main, second] = rows.copies as [(typeof rows.copies)[number], (typeof rows.copies)[number]]
  const secondRow = await db.itemRoom.findFirstOrThrow({ where: { itemId: second.id } })
  await db.itemRoom.create({
    data: {
      itemId: main.id,
      roomId: secondRow.roomId,
      assigneeId: input.speakers[1],
      assistantId: input.seconds?.[1] ?? null,
      congregationId,
    },
  })
  await db.item.delete({ where: { id: second.id } })
  return { copies: copies.eventId, rows: rows.eventId, partName: first.name, partSection: first.section }
}
