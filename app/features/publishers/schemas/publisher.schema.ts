import { z } from 'zod'
import { nameSchema } from '~/shared/utils/name'
import { phoneSchema } from '~/shared/utils/phone'

const checkbox = z
  .string()
  .optional()
  .transform(v => v === 'on')
const calendarDay = z.iso.date().optional().or(z.literal(''))

// The publisher form, shared by the new and edit pages. The nomination is one choice (none, ministerial servant,
// elder), turned into the two flags the member keeps; a sister is named to neither, whatever the form says.
export const publisherFormSchema = z
  .object({
    firstname: nameSchema,
    lastname: nameSchema,
    email: z.string().email().optional().or(z.literal('')),
    gender: z.enum(['male', 'female']),
    birthDate: calendarDay,
    baptismDate: calendarDay,
    arrivedAt: calendarDay,
    nomination: z.enum(['none', 'servant', 'elder']).optional(),
    isAnointed: checkbox,
    group: z.preprocess(v => (v === '' || v === undefined ? undefined : v), z.coerce.number().optional()),
    phone: phoneSchema,
    address: z.string().optional().default(''),
  })
  .transform(({ nomination, ...value }) => ({
    ...value,
    isServant: value.gender === 'male' && nomination === 'servant',
    isHelder: value.gender === 'male' && nomination === 'elder',
  }))

export type PublisherFormInput = z.infer<typeof publisherFormSchema>
