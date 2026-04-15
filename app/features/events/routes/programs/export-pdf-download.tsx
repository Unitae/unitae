import { pdf } from '@react-pdf/renderer'
import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { ProgrammeDocument } from '~/features/events/ui/ProgrammeDocument'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/export-pdf-download'

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProgramViewer,
    Role.ProgramManager,
  ])
  if (!can(Role.ProgramViewer)) throw redirect('/congregation/programs')

  const url = new URL(request.url)
  const rawTemplateId = url.searchParams.get('templateId')
  const templateId = rawTemplateId && rawTemplateId !== 'all' ? Number(rawTemplateId) : null
  const startDate = new Date(String(url.searchParams.get('startDate')))
  const endDate = new Date(String(url.searchParams.get('endDate')))
  const contentType = url.searchParams.get('contentType') ?? 'both'

  logger.info(`Generating programme PDF. User ID: ${currentUser.id}. Template: ${templateId ?? 'all'}.`)

  return withScope(congregationId, async db => {
    const events = await db.event.findMany({
      where: {
        congregationId,
        ...(templateId ? { templateId } : { templateId: { not: null } }),
        startDate: { gte: startDate, lte: endDate },
      },
      include: {
        template: true,
        partAssignments: {
          include: { assignee: true, assistant: true },
          orderBy: { order: 'asc' },
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

    const file = await pdf(
      <ProgrammeDocument
        events={events}
        title={title}
        showParts={contentType === 'both' || contentType === 'parts'}
        showServices={contentType === 'both' || contentType === 'services'}
      />,
    ).toBlob()

    const filename = `programme-${templateId ?? 'tous'}_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.pdf`

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  })
}
