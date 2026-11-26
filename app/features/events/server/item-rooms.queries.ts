import type { Prisma } from '~/database/generated/client'

/**
 * A meeting part's rooms as the readers include them for `partsInRooms` (model/part-rooms.ts): each row's people and
 * conflict, and its room's name, key and order. Spread into an item's `select` or `include`.
 */
export const ITEM_ROOMS = {
  rooms: {
    select: {
      id: true,
      roomId: true,
      assigneeId: true,
      assistantId: true,
      externalSpeakerId: true,
      hasConflict: true,
      room: { select: { name: true, key: true, order: true } },
    },
  },
} satisfies Prisma.ItemInclude

/** A part one of whose rooms has `who` as its speaker or second speaker: how a person's parts are found. */
export const PART_HELD_BY = (who: number | { in: number[] }) =>
  ({ rooms: { some: { OR: [{ assigneeId: who }, { assistantId: who }] } } }) satisfies Prisma.ItemWhereInput

/** The same, in a room whose people are flagged for a conflict (an absence): a person's conflicts. */
export const PART_CONFLICT_OF = (who: number | { in: number[] }) =>
  ({
    rooms: { some: { hasConflict: true, OR: [{ assigneeId: who }, { assistantId: who }] } },
  }) satisfies Prisma.ItemWhereInput
