import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

// What the « Mettre à jour la liste » screen posts, as JSON beside the PDF: the list's date, its two contacts and the
// changes to make. The server checks every row again against where each speaker really is.

const text = (max: number) => z.string().trim().max(max)
const email = text(200).refine(value => value === '' || z.email().safeParse(value).success, {
  error: () => m.external_speakers_error_email(),
})

const fields = z
  .object({
    name: text(120).min(1, { error: () => m.external_speakers_error_name() }),
    phone: text(40),
    phone2: text(40),
    email,
    email2: email,
    talks: z.array(z.number().int().positive().max(9999)).max(500),
  })
  .refine(value => [value.phone, value.phone2, value.email, value.email2].some(field => field !== ''), {
    error: () => m.external_speakers_error_contact(),
  })

const id = z.number().int().positive()
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export const speakerListUpdateSchema = z.object({
  listDate: z
    .string()
    .refine(value => value === '' || ISO_DAY.test(value))
    .transform(value => (value === '' ? null : new Date(`${value}T00:00:00.000Z`))),
  contacts: z.object({
    responsibleName: text(120),
    responsiblePhone: text(40),
    responsibleEmail: email,
    coordinatorName: text(120),
    coordinatorPhone: text(40),
    coordinatorEmail: email,
  }),
  rows: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('create'), fields }),
        z.object({ kind: z.literal('update'), speakerId: id, fields }),
        z.object({ kind: z.literal('move'), speakerId: id, fields }),
        z.object({ kind: z.literal('retire'), speakerId: id }),
      ]),
    )
    .max(500),
})

export type SpeakerListUpdateInput = z.infer<typeof speakerListUpdateSchema>
