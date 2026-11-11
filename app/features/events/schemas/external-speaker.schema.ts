import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

// One action on the external-speakers page, discriminated by intent: a speaker or a congregation created, edited,
// retired, put back or deleted. Every one of them reads and writes the same directory and comes back to the same page.

const id = z.coerce.number().int().positive()
/** An empty congregation select is the legacy « Sans assemblée » case, a real value rather than a blank. */
const optionalId = z.preprocess(
  value => (value === '' || value === 'none' || value == null ? null : value),
  z.coerce.number().int().positive().nullable(),
)
const text = (max: number) => z.string().trim().max(max).optional().default('')
export const email = z
  .string()
  .trim()
  .max(200)
  .optional()
  .default('')
  .refine(value => value === '' || z.email().safeParse(value).success, {
    error: () => m.external_speakers_error_email(),
  })

const TALK_SEPARATORS = /[\s,;/]+/

/** Talk numbers, from the token field's repeated inputs or a typed « 12, 54 102 »: whole numbers, each once. */
export const talks = z.preprocess(
  value => {
    const raw = Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : ''
    return raw
      .split(TALK_SEPARATORS)
      .filter(token => token !== '')
      .map(Number)
  },
  z.array(z.number().int().positive().max(9999)).max(500),
)

const speakerFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: () => m.external_speakers_error_name() })
    .max(120),
  speakerCongregationId: optionalId,
  phone: text(40),
  phone2: text(40),
  email,
  email2: email,
  talks,
  notes: text(2000),
}

const contactFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: () => m.external_speakers_error_congregation_name() })
    .max(120),
  responsibleName: text(120),
  responsiblePhone: text(40),
  responsibleEmail: email,
  coordinatorName: text(120),
  coordinatorPhone: text(40),
  coordinatorEmail: email,
  notes: text(2000),
}

export const externalSpeakerIntentSchema = z
  .discriminatedUnion('intent', [
    z.object({ intent: z.literal('speaker-create'), ...speakerFields }),
    z.object({ intent: z.literal('speaker-update'), speakerId: id, ...speakerFields }),
    z.object({ intent: z.literal('speaker-retire'), speakerId: id }),
    z.object({ intent: z.literal('speaker-restore'), speakerId: id }),
    z.object({ intent: z.literal('speaker-delete'), speakerId: id }),
    // `next: 'update'` goes on to import the new congregation's list.
    z.object({ intent: z.literal('congregation-create'), ...contactFields, next: z.enum(['update']).optional() }),
    z.object({ intent: z.literal('congregation-update'), speakerCongregationId: id, ...contactFields }),
    z.object({ intent: z.literal('congregation-delete'), speakerCongregationId: id }),
  ])
  .superRefine((value, context) => {
    if (value.intent !== 'speaker-create' && value.intent !== 'speaker-update') return
    // A new speaker joins a congregation's list; only a legacy record may stay without one.
    if (value.intent === 'speaker-create' && value.speakerCongregationId == null) {
      context.addIssue({
        code: 'custom',
        path: ['speakerCongregationId'],
        message: m.external_speakers_error_congregation_required(),
      })
    }
    // Someone we cannot reach cannot be invited.
    if ([value.phone, value.phone2, value.email, value.email2].every(field => field === '')) {
      context.addIssue({ code: 'custom', path: ['phone'], message: m.external_speakers_error_contact() })
    }
  })

export type ExternalSpeakerIntent = z.infer<typeof externalSpeakerIntentSchema>
