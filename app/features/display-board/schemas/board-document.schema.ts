import { z } from 'zod'

export const createDocumentSchema = z.object({
  name: z.string().min(1),
  sectionId: z.coerce.number(),
  'visible-from': z.string().optional().default(''),
  'visible-until': z.string().optional().default(''),
  hightlighted: z.string().optional(),
})

export const updateDocumentSchema = z.object({
  title: z.string().min(1),
  sectionId: z.coerce.number(),
  'visible-from': z.string().optional().default(''),
  'visible-until': z.string().optional().default(''),
  hightlighted: z.string().optional(),
})

export const createDynamicDocumentSchema = z.object({
  dynamicType: z.string().min(1),
  dynamicRef: z.string().optional().default(''),
  title: z.string().min(1),
})

export const updateDynamicDocumentSchema = z.object({
  title: z
    .string()
    .min(1)
    .transform(v => v.trim()),
  sectionId: z.coerce.number(),
  'visible-from': z.string().optional().default(''),
  'visible-until': z.string().optional().default(''),
  hightlighted: z.string().optional(),
  showServices: z.string().optional(),
})

export const restoreVersionSchema = z.object({
  versionId: z.coerce.number(),
})

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>
export type CreateDynamicDocumentInput = z.infer<typeof createDynamicDocumentSchema>
export type UpdateDynamicDocumentInput = z.infer<typeof updateDynamicDocumentSchema>
export type RestoreVersionInput = z.infer<typeof restoreVersionSchema>
