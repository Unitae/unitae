import { z } from 'zod'

export const boardDocumentCreatedPayloadSchema = z.object({
  title: z.string(),
  documentId: z.number().int().positive(),
})

export type BoardDocumentCreatedPayload = z.infer<typeof boardDocumentCreatedPayloadSchema>

export const boardDocumentDeletedPayloadSchema = z.object({
  title: z.string().min(1),
})

export type BoardDocumentDeletedPayload = z.infer<typeof boardDocumentDeletedPayloadSchema>

export const boardDocumentUpdatedPayloadSchema = z.object({
  title: z.string().min(1),
  documentId: z.number().int().positive(),
})

export type BoardDocumentUpdatedPayload = z.infer<typeof boardDocumentUpdatedPayloadSchema>

export const boardDocumentExpiringPayloadSchema = z.object({
  documents: z.array(z.object({ id: z.number().int().positive(), title: z.string() })).min(1),
})

export type BoardDocumentExpiringPayload = z.infer<typeof boardDocumentExpiringPayloadSchema>
