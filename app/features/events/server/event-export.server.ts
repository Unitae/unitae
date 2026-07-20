import { z } from 'zod'
import type { Prisma } from '~/database/generated/client'
import { ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface TemplateExportConfig {
  templateId: number
  parts: boolean
  services: boolean
}

const templateExportConfigSchema = z.array(
  z.object({
    templateId: z.number().int().positive(),
    parts: z.boolean(),
    services: z.boolean(),
  }),
)

/**
 * Decodes and validates the Base64-encoded export configuration from URL params.
 * Throws ValidationError if the payload is malformed.
 */
export function parseExportConfigs(raw: string): TemplateExportConfig[] {
  try {
    const json = JSON.parse(atob(raw))
    return templateExportConfigSchema.parse(json)
  } catch {
    throw new ValidationError('configs', 'Invalid export configuration')
  }
}

export const programmeExportInclude = {
  template: true,
  eventParts: {
    include: { assignee: true, assistant: true, externalSpeaker: true },
    orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
  },
  eventServiceRoles: {
    include: { assignee: true },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.EventInclude

/**
 * Fetches events with their part and service role assignments for PDF export.
 * Events are ordered by startDate ascending.
 */
export function getEventsForExport(db: TransactionClient, templateIds: number[], startDate: Date, endDate: Date) {
  return db.event.findMany({
    where: {
      templateId: { in: templateIds },
      startDate: { gte: startDate, lte: endDate },
    },
    include: programmeExportInclude,
    orderBy: { startDate: 'asc' },
  })
}

export type ExportEvent = Awaited<ReturnType<typeof getEventsForExport>>[number]
