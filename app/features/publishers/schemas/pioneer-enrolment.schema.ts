import { z } from 'zod'
import { PublisherType } from '~/shared/types/publisher-type'

// Empty form fields arrive as '' — coerce those to undefined before the numeric coercion so an
// omitted end / goal reads as absent (an ongoing stint), not as 0.
const emptyToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v)

// Field-shape validation at the boundary (spec §4): a pioneer type (never Normal), a positive
// per-person goal when present, and an end on or after the start. Structural invariants
// (non-overlap, end-bounds paired) live in the aggregate + DB check, not here.
export const pioneerEnrolmentSchema = z
  .object({
    type: z.nativeEnum(PublisherType),
    startMonth: z.coerce.number().int().min(0).max(11),
    startYear: z.coerce.number().int().min(2022),
    endMonth: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(11).optional()),
    endYear: z.preprocess(emptyToUndefined, z.coerce.number().int().min(2022).optional()),
    monthlyGoal: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  })
  .superRefine((val, ctx) => {
    if (val.type === PublisherType.Normal) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['type'], message: 'An enrolment requires a pioneer type' })
    }
    if (val.endMonth != null && val.endYear != null) {
      const start = val.startYear * 12 + val.startMonth
      const end = val.endYear * 12 + val.endMonth
      if (end < start) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endMonth'], message: 'End must be on or after the start' })
      }
    }
  })

export type PioneerEnrolmentInput = z.infer<typeof pioneerEnrolmentSchema>
