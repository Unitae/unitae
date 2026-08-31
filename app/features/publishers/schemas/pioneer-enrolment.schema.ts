import { z } from 'zod'
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

// ── Edit-page form schemas (one per intent) ────────────────────────────────────────────────
// The publisher edit page dispatches these on a hidden `intent` field. Standing appointments are
// ongoing stints (no end in the create form — a separate close intent bounds them); monthly
// auxiliary is a single-month stint carrying a per-person goal.

// Standing appointment: permanent / special / missionary / permanent-auxiliary — never Normal and
// never monthly auxiliary (that has its own form).
export const standingAppointmentSchema = z.object({
  intent: z.literal('enrol-standing'),
  type: z
    .nativeEnum(PublisherType)
    .refine(t => t !== PublisherType.Normal, 'A standing appointment requires a pioneer type'),
  startMonth: z.coerce.number().int().min(0).max(11),
  startYear: z.coerce.number().int().min(2022),
})

// Close the active standing appointment at a chosen month.
export const closeAppointmentSchema = z.object({
  intent: z.literal('close-standing'),
  enrolmentId: z.coerce.number().int().positive(),
  endMonth: z.coerce.number().int().min(0).max(11),
  endYear: z.coerce.number().int().min(2022),
})

// Monthly auxiliary enrolment for a single month, at a per-person goal (typically 15 or 30 h).
export const monthlyAuxiliaryEnrolmentSchema = z.object({
  intent: z.literal('enrol-monthly'),
  month: z.coerce.number().int().min(0).max(11),
  year: z.coerce.number().int().min(2022),
  monthlyGoal: z.coerce.number().int().positive(),
})

// Remove an enrolment outright (used to undo a monthly auxiliary added in error).
export const removeEnrolmentSchema = z.object({
  intent: z.literal('remove-enrolment'),
  enrolmentId: z.coerce.number().int().positive(),
})

// Correct the per-person goal on an existing stint. The goal is frozen onto the enrolment when it is
// created, so this is the only way to fix a wrong pick — an empty field clears it, dropping the stint
// back to the congregation's configured type rate.
export const updateEnrolmentGoalSchema = z.object({
  intent: z.literal('update-goal'),
  enrolmentId: z.coerce.number().int().positive(),
  monthlyGoal: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
})

export type StandingAppointmentInput = z.infer<typeof standingAppointmentSchema>
export type CloseAppointmentInput = z.infer<typeof closeAppointmentSchema>
export type MonthlyAuxiliaryEnrolmentInput = z.infer<typeof monthlyAuxiliaryEnrolmentSchema>
export type RemoveEnrolmentInput = z.infer<typeof removeEnrolmentSchema>
export type UpdateEnrolmentGoalInput = z.infer<typeof updateEnrolmentGoalSchema>
