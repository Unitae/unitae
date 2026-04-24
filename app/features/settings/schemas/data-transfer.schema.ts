import { z } from 'zod'

export const exportOptionsSchema = z.object({
  includeFiles: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  includeAuditLogs: z
    .string()
    .optional()
    .transform(v => v === 'on'),
})
