import { redirect } from 'react-router'
import {
  getEventsForExport,
  parseExportConfigs,
  type TemplateExportConfig,
} from '~/features/events/server/programme-export.server'
import { ProgrammeBoardDocument } from '~/features/events/ui/ProgrammeBoardDocument'
import { ProgrammeDocument } from '~/features/events/ui/ProgrammeDocument'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  currentAccountContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { renderPdfResponse } from '~/shared/infra/pdf.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/export-pdf-download'

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.ProgramViewer)) throw redirect('/programs')

  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)

  const url = new URL(request.url)
  const startDate = new Date(String(url.searchParams.get('startDate')))
  const endDate = new Date(String(url.searchParams.get('endDate')))

  // Support both new format (configs) and legacy format (templateId + contentType)
  const rawConfigs = url.searchParams.get('configs')

  if (rawConfigs) {
    return handleNewFormat(rawConfigs, startDate, endDate, url, currentUser, congregation, context)
  }

  return handleLegacyFormat(url, startDate, endDate, currentUser, context)
}

function handleNewFormat(
  rawConfigs: string,
  startDate: Date,
  endDate: Date,
  url: URL,
  currentUser: { id: number; congregationId: number },
  congregation: { displayName: string },
  context: Parameters<typeof withScopeFromContext>[0],
) {
  const configs = parseExportConfigs(rawConfigs)
  const templateIds = configs.map(c => c.templateId)
  const groupBy = url.searchParams.get('groupBy') === 'template' ? ('template' as const) : ('date' as const)

  logger.info(
    `Generating programme PDF (new format). User ID: ${currentUser.id}. Templates: ${templateIds.join(', ')}.`,
  )

  return withScopeFromContext(context, async db => {
    const events = await getEventsForExport(db, templateIds, startDate, endDate)

    const configMap = new Map<number, Omit<TemplateExportConfig, 'templateId'>>(
      configs.map(c => [c.templateId, { parts: c.parts, services: c.services }]),
    )

    const customTitle = url.searchParams.get('title')
    const baseTitle = customTitle || m.programs_export_default_title()
    const title = `${baseTitle} — ${startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`

    const filename = `programme_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.pdf`

    return renderPdfResponse(
      <ProgrammeBoardDocument
        events={events}
        configMap={configMap}
        groupBy={groupBy}
        title={title}
        congregationName={congregation.displayName}
      />,
      filename,
    )
  })
}

// Backwards compatibility with legacy URL format: ?templateId=X&contentType=both
function handleLegacyFormat(
  url: URL,
  startDate: Date,
  endDate: Date,
  currentUser: { id: number; congregationId: number },
  context: Parameters<typeof withScopeFromContext>[0],
) {
  const rawTemplateId = url.searchParams.get('templateId')
  const templateId = rawTemplateId && rawTemplateId !== 'all' ? Number(rawTemplateId) : null
  const contentType = url.searchParams.get('contentType') ?? 'both'

  logger.info(`Generating programme PDF (legacy). User ID: ${currentUser.id}. Template: ${templateId ?? 'all'}.`)

  return withScopeFromContext(context, async db => {
    const events = await db.event.findMany({
      where: {
        ...(templateId ? { templateId } : { templateId: { not: null } }),
        startDate: { gte: startDate, lte: endDate },
      },
      include: {
        template: true,
        partAssignments: {
          include: { assignee: true, assistant: true },
          orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
        },
        serviceRoleAssignments: {
          include: { assignee: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { startDate: 'asc' },
    })

    const templateName = templateId
      ? (events[0]?.template?.name ?? m.programs_export_default_title())
      : m.programs_export_default_title()
    const title = `${templateName} — ${startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`

    const filename = `programme-${templateId ?? 'tous'}_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.pdf`

    return renderPdfResponse(
      <ProgrammeDocument
        events={events}
        title={title}
        showParts={contentType === 'both' || contentType === 'parts'}
        showServices={contentType === 'both' || contentType === 'services'}
      />,
      filename,
    )
  })
}
