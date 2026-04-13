import { useState } from 'react'
import { redirect } from 'react-router'
import * as m from '~/paraglide/messages'
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
  return [{ title: m.programs_export_meta_title() }]
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
      <PageHeader title={m.programs_export_page_title()} subtitle={m.programs_export_page_subtitle()} />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{m.programs_export_options_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="templateId">{m.programs_export_meeting_type_label()}</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder={m.programs_export_all_types()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{m.programs_export_all_types()}</SelectItem>
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
                <Label htmlFor="startDate">{m.programs_export_from_label()}</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="endDate">{m.programs_export_to_label()}</Label>
                <Input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contentType">{m.programs_export_content_label()}</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">{m.programs_export_content_both()}</SelectItem>
                  <SelectItem value="parts">{m.programs_export_content_parts_only()}</SelectItem>
                  <SelectItem value="services">{m.programs_export_content_services_only()}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button asChild className="w-fit">
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                {m.programs_export_download_button()}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
