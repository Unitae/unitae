import { z } from 'zod'

// One action on the organigram page, discriminated by intent. The alternative — a route per
// verb, as the board sections do — would be seven files for operations that all read and write
// the same tree and all redirect back to the same page.

const roleId = z.coerce.number().int().positive()
/** An empty parent select means "at the top of the chart", which is a real choice, not a blank. */
const optionalParent = z.preprocess(
  value => (value === '' || value === 'none' || value == null ? null : value),
  z.coerce.number().int().positive().nullable(),
)

export const seatKindSchema = z.enum(['leader', 'deputy', 'member'])
export type SeatKindValue = z.infer<typeof seatKindSchema>

export const organigramIntentSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('add'), roleId, parentRoleId: optionalParent }),
  // Create a service and attach it in one submit. `createRole` slugifies the name into a key and
  // refuses a collision, so the action surfaces that rather than the form guessing at uniqueness.
  z.object({
    intent: z.literal('create'),
    name: z.string().trim().min(1).max(100),
    parentRoleId: optionalParent,
  }),
  z.object({ intent: z.literal('remove'), roleId }),
  z.object({ intent: z.literal('set-parent'), roleId, parentRoleId: optionalParent }),
  z.object({ intent: z.literal('move'), roleId, direction: z.enum(['up', 'down']) }),
  z.object({ intent: z.literal('seat'), roleId, memberId: roleId, kind: seatKindSchema }),
  z.object({ intent: z.literal('unseat'), roleId, memberId: roleId }),
])

export type OrganigramIntent = z.infer<typeof organigramIntentSchema>
