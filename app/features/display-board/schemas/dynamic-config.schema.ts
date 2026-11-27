import { z } from 'zod'

const eventTemplateConfigSchema = z.object({
  templateId: z.number().int().positive(),
  parts: z.boolean(),
  services: z.boolean(),
  /** The duties schedule templates whose services it shows, when the type uses several; absent: every one. */
  dutyTemplates: z.array(z.number().int().positive()).optional(),
})

const programmeDynamicConfigSchema = z.object({
  templates: z.array(eventTemplateConfigSchema),
  groupBy: z.enum(['date', 'template']).default('date'),
})

export type ProgrammeDynamicConfig = z.infer<typeof programmeDynamicConfigSchema>

export function parseProgrammeDynamicConfig(raw: unknown): ProgrammeDynamicConfig | null {
  const result = programmeDynamicConfigSchema.safeParse(raw)
  return result.success ? result.data : null
}
