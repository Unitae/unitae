import { z } from 'zod'

// One action on the organigram page, discriminated by intent. The alternative — a route per
// verb, as the board sections do — would be seven files for operations that all read and write
// the same tree and all redirect back to the same page.

const id = z.coerce.number().int().positive()
/** An empty parent select means "at the top of the chart", which is a real choice, not a blank. */
const optionalParent = z.preprocess(
  value => (value === '' || value === 'none' || value == null ? null : value),
  z.coerce.number().int().positive().nullable(),
)

export const seatKindSchema = z.enum(['leader', 'deputy', 'member'])
export type SeatKindValue = z.infer<typeof seatKindSchema>

/** An HTML checkbox: 'on' when ticked, absent when not — absence is false, not missing data. */
export const checkbox = z.preprocess(value => value === 'on' || value === 'true' || value === true, z.boolean())

export const organigramIntentSchema = z.discriminatedUnion('intent', [
  // A role of the congregation placed on the chart: under another, or back at the top (a list).
  z.object({ intent: z.literal('add'), roleId: id, parentRoleId: optionalParent }),
  z.object({ intent: z.literal('remove'), roleId: id }),
  z.object({ intent: z.literal('set-parent'), roleId: id, parentRoleId: optionalParent }),
  z.object({ intent: z.literal('move'), roleId: id, direction: z.enum(['up', 'down']) }),
  z.object({ intent: z.literal('seat'), roleId: id, memberId: id, kind: seatKindSchema }),
  z.object({ intent: z.literal('unseat'), roleId: id, memberId: id }),
  // A new role, under a role of the chart or outside it (no parent).
  z.object({
    intent: z.literal('create'),
    name: z.string().trim().min(1).max(100),
    singlePerson: checkbox,
    parentRoleId: optionalParent,
    description: z.string().trim().max(1000).optional().default(''),
  }),
  // A role's own definition, edited in its panel.
  z.object({
    intent: z.literal('update'),
    roleId: id,
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).optional().default(''),
    note: z.string().trim().max(200).optional().default(''),
    singlePerson: checkbox,
  }),
  z.object({ intent: z.literal('delete'), roleId: id }),
])

export type OrganigramIntent = z.infer<typeof organigramIntentSchema>
