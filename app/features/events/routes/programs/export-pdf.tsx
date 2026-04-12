import { pdf } from '@react-pdf/renderer'
import { useState } from 'react'
import { Form, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import { ProgrammeDocument } from '~/features/events/ui/ProgrammeDocument'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/export-pdf'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Exporter un programme en PDF - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramViewer, Role.ProgramManager])
  if (!can(Role.ProgramViewer)) throw redirect('/congregation/programs')

  return withScope(congregationId, async db => {
    const templates = await getTemplates(db, congregationId)
    return { templates }
  })
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProgramViewer,
    Role.ProgramManager,
  ])
  if (!can(Role.ProgramViewer)) throw redirect('/congregation/programs')

  const form = await request.formData()
  const templateId = form.get('templateId') && form.get('templateId') !== 'all' ? Number(form.get('templateId')) : null
  const startDate = new Date(String(form.get('startDate')))
  const endDate = new Date(String(form.get('endDate')))
  const contentType = String(form.get('contentType') ?? 'both')

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

    const templateName = templateId ? (events[0]?.template?.name ?? 'Programme') : 'Programme'

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

export default function ExportPdfPage({ loaderData }: Route.ComponentProps) {
  const { templates } = loaderData
  const [selectedTemplate, setSelectedTemplate] = useState('all')

  const today = new Date()
  const twoMonthsLater = new Date()
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Exporter en PDF" subtitle="Générez un document PDF du programme pour impression." />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Options d'export</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="templateId">Type de réunion</Label>
              <Select name="templateId" value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="startDate">Du</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  defaultValue={today.toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="endDate">Au</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  defaultValue={twoMonthsLater.toISOString().split('T')[0]}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contentType">Contenu</Label>
              <Select name="contentType" defaultValue="both">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Programme spirituel et services</SelectItem>
                  <SelectItem value="parts">Programme spirituel uniquement</SelectItem>
                  <SelectItem value="services">Services uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-fit">
              Télécharger le PDF
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
