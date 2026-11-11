import { z } from 'zod'
import { CONTACT_MODES } from '~/features/events/model/our-speaker.type'
import * as m from '~/i18n/paraglide/messages'
import { email, talks } from './external-speaker.schema'

// One action on « Notre liste », discriminated by intent: a brother's entry saved, the list sent by e-mail, or marked
// as sent from someone's own mailbox.

const id = z.coerce.number().int().positive()
const text = (max: number) => z.string().trim().max(max).optional().default('')
const checkbox = z.preprocess(value => value === 'on' || value === 'true' || value === true, z.boolean())
/** The congregations ticked: one, several (repeated inputs), or none, which is refused. */
const chosen = z.preprocess(
  value => (value == null ? [] : Array.isArray(value) ? value : [value]),
  z.array(id).min(1, { error: () => m.external_speakers_send_choose() }),
)
const DAY = /^\d{4}-\d{2}-\d{2}$/

const brotherUpdate = z
  .object({
    intent: z.literal('brother-update'),
    memberId: id,
    onList: checkbox,
    talks,
    phoneMode: z.enum(CONTACT_MODES),
    phoneCustom: text(40),
    phone2: text(40),
    emailMode: z.enum(CONTACT_MODES),
    emailCustom: email,
    email2: email,
    note: text(300),
  })
  .superRefine((value, context) => {
    // « Un autre numéro » left blank would share nothing while saying it shares something.
    if (value.phoneMode === 'custom' && value.phoneCustom === '') {
      context.addIssue({ code: 'custom', path: ['phoneCustom'], message: m.external_speakers_ours_error_phone() })
    }
    if (value.emailMode === 'custom' && value.emailCustom === '') {
      context.addIssue({ code: 'custom', path: ['emailCustom'], message: m.external_speakers_ours_error_email() })
    }
  })

const send = z.object({
  intent: z.literal('send'),
  speakerCongregationIds: chosen,
  copyCoordinators: checkbox,
  subject: z
    .string()
    .trim()
    .min(1, { error: () => m.external_speakers_send_error_subject() })
    .max(200),
  message: z
    .string()
    .trim()
    .min(1, { error: () => m.external_speakers_send_error_message() })
    .max(5000),
})

const markSent = z.object({
  intent: z.literal('mark-sent'),
  speakerCongregationIds: chosen,
  sentOn: z.string().regex(DAY),
})

export const ourSpeakerIntentSchema = z.discriminatedUnion('intent', [brotherUpdate, send, markSent])

export type OurSpeakerIntent = z.infer<typeof ourSpeakerIntentSchema>
