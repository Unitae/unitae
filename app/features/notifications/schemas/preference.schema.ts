import { z } from 'zod'

export const togglePreferenceSchema = z.object({
  notificationType: z.string().min(1),
  enabled: z.enum(['true', 'false']).transform(v => v === 'true'),
})
