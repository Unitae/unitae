import { z } from 'zod'
import { ENROLMENT_MODES } from '~/features/publishers/model/pioneer-enrolment-form'
import { PublisherType } from '~/shared/types/publisher-type'

// Empty form fields arrive as '' — coerce those to undefined before the numeric coercion so an
// omitted end / goal reads as absent (an ongoing stint), not as 0.
const emptyToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v)

// Field-shape validation at the boundary (spec §4): a pioneer type (never Normal), a positive
// per-person goal when present, an end on or after the start, and end bounds set-or-absent together.
// The non-overlap invariant lives in the aggregate + DB; end-bounds pairing is mirrored here as
// defense-in-depth (the aggregate and the DB end_bounds_paired CHECK still enforce it).
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
    // End bounds are paired: both set (closed) or both absent (ongoing). Mirrors the aggregate's
    // _assertEndBoundsPaired and the DB end_bounds_paired CHECK, so the boundary rejects it too.
    if ((val.endMonth == null) !== (val.endYear == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endMonth'],
        message: 'End month and end year must be set together',
      })
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

// ── The record's enrolment dialogs ──────────────────────────────────────────────────────────
// One action, dispatched on `intent`: enrol, correct a stint (the same fields as enrolling, plus its end),
// stop the ongoing one at a month, or remove one recorded in error. The service is the dialog's choice
// (ENROLMENT_MODES); the route maps it to the stored type.

const month = z.coerce.number().int().min(0).max(11)
const year = z.coerce.number().int().min(2022)
const enrolmentId = z.coerce.number().int().positive()
const mode = z.enum(ENROLMENT_MODES)
const optionalGoal = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().max(200).optional())
const optionalMonth = z.preprocess(emptyToUndefined, month.optional())
const optionalYear = z.preprocess(emptyToUndefined, year.optional())

export const enrolmentActionSchema = z
  .discriminatedUnion('intent', [
    z.object({ intent: z.literal('create'), mode, startMonth: month, startYear: year, monthlyGoal: optionalGoal }),
    z.object({
      intent: z.literal('correct'),
      enrolmentId,
      mode,
      startMonth: month,
      startYear: year,
      endMonth: optionalMonth,
      endYear: optionalYear,
      monthlyGoal: optionalGoal,
    }),
    z.object({ intent: z.literal('stop'), enrolmentId, endMonth: month, endYear: year }),
    z.object({ intent: z.literal('remove'), enrolmentId }),
  ])
  .superRefine((value, ctx) => {
    // A one-month auxiliary is enrolled at a goal the dialog always offers: the congregation's rate or the reduced one.
    if (value.intent === 'create' && value.mode === 'monthly-aux' && value.monthlyGoal == null) {
      ctx.addIssue({ code: 'custom', path: ['monthlyGoal'], message: 'A one-month auxiliary needs a goal' })
    }
    if (value.intent !== 'correct' || value.mode === 'monthly-aux') return
    if ((value.endMonth == null) !== (value.endYear == null)) {
      ctx.addIssue({ code: 'custom', path: ['endMonth'], message: 'End month and end year must be set together' })
    }
    if (value.endMonth != null && value.endYear != null) {
      if (value.endYear * 12 + value.endMonth < value.startYear * 12 + value.startMonth) {
        ctx.addIssue({ code: 'custom', path: ['endMonth'], message: 'End must be on or after the start' })
      }
    }
  })

export type EnrolmentActionInput = z.infer<typeof enrolmentActionSchema>
