import { z } from 'zod'

const ids = z.array(z.coerce.number().int().positive())

/** « Changer le type » (D40): the new kind, the schedules kept and removed, the new kind's schedule templates added. */
export const kindChangeSchema = z.strictObject({
  kindId: z.coerce.number().int().positive(),
  keep: ids,
  remove: ids,
  add: ids,
})

/** Reads the dialog's form: a `keep` or a `remove` field per schedule listed, an `add` field per ticked suggestion. */
export function kindChangeFrom(formData: FormData) {
  return kindChangeSchema.safeParse({
    kindId: formData.get('kindId'),
    keep: formData.getAll('keep'),
    remove: formData.getAll('remove'),
    add: formData.getAll('add'),
  })
}
