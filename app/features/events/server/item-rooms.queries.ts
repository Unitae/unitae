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
