import { useState } from 'react'
import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
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

export default function ExportPdfPage({ loaderData }: Route.ComponentProps) {
  const { templates } = loaderData

  const [selectedTemplate, setSelectedTemplate] = useState('all')
  const [contentType, setContentType] = useState('both')

  const today = new Date()
  const twoMonthsLater = new Date()
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2)

  const [startDate, setStartDate] = useState(today.toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(twoMonthsLater.toISOString().split('T')[0])

  const downloadUrl = `/congregation/programs/export-pdf/download?templateId=${selectedTemplate}&startDate=${startDate}&endDate=${endDate}&contentType=${contentType}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Exporter en PDF" subtitle="Générez un document PDF du programme pour impression." />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Options d'export</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="templateId">Type de réunion</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
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
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="endDate">Au</Label>
                <Input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contentType">Contenu</Label>
              <Select value={contentType} onValueChange={setContentType}>
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

            <Button asChild className="w-fit">
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                Télécharger le PDF
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
