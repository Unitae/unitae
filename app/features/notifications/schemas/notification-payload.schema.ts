import { z } from 'zod'

export const boardDocumentCreatedPayloadSchema = z.object({
  title: z.string(),
  documentId: z.number().int().positive(),
})

export type BoardDocumentCreatedPayload = z.infer<typeof boardDocumentCreatedPayloadSchema>
