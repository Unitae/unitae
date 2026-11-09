import { z } from 'zod'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/i18n/paraglide/messages'

const DAY = /^\d{4}-\d{2}-\d{2}$/

const id = z.coerce.number().int().positive()
const day = (message: () => string) => z.string({ error: message }).regex(DAY, { error: message })
const publisher = z.coerce
  .number({ error: () => m.attributions_panel_publisher_required() })
  .int()
  .positive({ error: () => m.attributions_panel_publisher_required() })
const method = z.enum([TerritoryAttributionKind.Default, TerritoryAttributionKind.Phone])
const notes = z.string().optional().default('')

/**
 * What the attributions panel sends: attribute a territory, change an attribution, rentrer it (with the day it came
 * back), cancel it (a mistake: it is erased), or resume one a campaign paused. Days are `YYYY-MM-DD`.
 */
export const attributionPanelActionSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('create'),
    territory: id,
    publisher,
    'start-date': day(() => m.attributions_panel_start_required()),
    type: method,
    notes,
  }),
  z.object({
    intent: z.literal('update'),
    id,
    publisher,
    'start-date': day(() => m.attributions_panel_start_required()),
    'late-date': day(() => m.attributions_panel_due_required()),
    type: method,
    notes,
  }),
  z.object({ intent: z.literal('return'), id, 'end-date': day(() => m.attributions_panel_return_required()) }),
  z.object({ intent: z.literal('cancel'), id }),
  z.object({ intent: z.literal('resume'), id }),
])

export type AttributionPanelAction = z.infer<typeof attributionPanelActionSchema>

/** What the panel loads: one attribution to change, or one territory to attribute. */
export const attributionPanelQuerySchema = z.union([z.object({ attribution: id }), z.object({ territory: id })])
