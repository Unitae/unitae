import { z } from 'zod'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'

const numberField = z
  .string({ error: () => m.territory_editor_number_required() })
  .trim()
  .min(1, { error: () => m.territory_editor_number_required() })
  .max(40, { error: () => m.territory_editor_number_too_long() })

const entrancesField = z
  .array(z.coerce.number().int().positive())
  .or(
    z.coerce
      .number()
      .int()
      .positive()
      .transform(v => [v]),
  )
  .optional()
  .default([])

const reassignmentsField = z
  .array(
    z.object({
      entranceId: z.coerce.number().int().positive(),
      fromTerritoryId: z.coerce.number().int().positive(),
    }),
  )
  .optional()
  .default([])

export const createTerritorySchema = z.object({
  number: numberField,
  type: z.enum(TerritoryKindKey),
  entrances: entrancesField,
  reassignments: reassignmentsField,
})

export const updateTerritorySchema = z.object({
  /** Left out, the number stays. */
  number: numberField.optional(),
  entrances: entrancesField,
  reassignments: reassignmentsField,
  notes: z.string().optional().default(''),
})

export type CreateTerritoryInput = z.infer<typeof createTerritorySchema>
export type UpdateTerritoryInput = z.infer<typeof updateTerritorySchema>
