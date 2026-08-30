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

/** An empty select means "nothing picked", which the attach intent resolves against `name`. */
const optionalRole = z.preprocess(
  value => (value === '' || value == null ? null : value),
  z.coerce.number().int().positive().nullable(),
)

export const organigramIntentSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('add'), roleId: id, parentRoleId: optionalParent }),
  // One form, no mode toggle: pick an existing service OR type a new name, and the action does
  // whichever the admin actually filled in (a typed name wins). Asking "existing or new?" with
  // radios forced an answer before the options were even visible.
  z.object({
    intent: z.literal('attach'),
    roleId: optionalRole,
    name: z.string().trim().max(100).optional().default(''),
    parentRoleId: optionalParent,
    // A personal role: one titulaire, adjoints allowed, no plain members. Read only when a new
    // service is created — an adopted role keeps its own shape.
    singlePerson: checkbox,
  }),
  z.object({ intent: z.literal('remove'), roleId: id }),
  z.object({ intent: z.literal('set-parent'), roleId: id, parentRoleId: optionalParent }),
  z.object({ intent: z.literal('move'), roleId: id, direction: z.enum(['up', 'down']) }),
  z.object({ intent: z.literal('seat'), roleId: id, memberId: id, kind: seatKindSchema }),
  z.object({ intent: z.literal('unseat'), roleId: id, memberId: id }),
])

export type OrganigramIntent = z.infer<typeof organigramIntentSchema>
