import { z } from 'zod'

const ids = z.array(z.coerce.number().int().positive())

/** « Changer le type » (D40): the new kind, the schedules kept, the new kind's schedule templates added. */
export const kindChangeSchema = z.strictObject({
  kindId: z.coerce.number().int().positive(),
  keep: ids,
  add: ids,
})

/** Reads the dialog's form: one `keep` and one `add` field per ticked box. */
export function kindChangeFrom(formData: FormData) {
  return kindChangeSchema.safeParse({
    kindId: formData.get('kindId'),
    keep: formData.getAll('keep'),
    add: formData.getAll('add'),
  })
}
