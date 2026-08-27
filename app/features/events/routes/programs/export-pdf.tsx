import { useState } from 'react'
import { redirect } from 'react-router'
import { getTemplates } from '~/features/events/server/event-templates.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/export-pdf'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_export_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewPrograms)) throw redirect('/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const templates = await getTemplates(db, congregationId)
    return { templates }
  })
}

interface TemplateConfig {
  selected: boolean
  parts: boolean
  services: boolean
}

export default function ExportPdfPage({ loaderData }: Route.ComponentProps) {
  const { templates } = loaderData

  const [configs, setConfigs] = useState<Record<number, TemplateConfig>>(
    Object.fromEntries(templates.map(t => [t.id, { selected: true, parts: true, services: true }])),
  )
  const [groupBy, setGroupBy] = useState<'date' | 'template'>('date')
  const [pdfTitle, setPdfTitle] = useState<string>(m.programs_export_default_title())

  const today = new Date()
  const twoMonthsLater = new Date()
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2)

  const [startDate, setStartDate] = useState(today.toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(twoMonthsLater.toISOString().split('T')[0])

  function updateConfig(templateId: number, patch: Partial<TemplateConfig>) {
    setConfigs(prev => ({
      ...prev,
      [templateId]: { ...prev[templateId], ...patch },
    }))
  }

  const selectedConfigs = Object.entries(configs)
    .filter(([_, c]) => c.selected && (c.parts || c.services))
    .map(([id, c]) => ({ templateId: Number(id), parts: c.parts, services: c.services }))

  const hasSelection = selectedConfigs.length > 0
  const encoded = hasSelection ? btoa(JSON.stringify(selectedConfigs)) : ''
  const downloadUrl = `/programs/export-pdf/download?configs=${encodeURIComponent(encoded)}&startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}&title=${encodeURIComponent(pdfTitle)}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.programs_export_page_title()}
        subtitle={m.programs_export_page_subtitle()}
        breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: m.programs_export_page_title() }]}
        backTo="/programs"
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{m.programs_export_options_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-5">
            {/* Title */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdfTitle">{m.programs_export_pdf_title_label()}</Label>
              <Input id="pdfTitle" type="text" value={pdfTitle} onChange={e => setPdfTitle(e.target.value)} />
            </div>

            {/* Date range */}
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

            {/* Per-template content selection */}
            <div className="flex flex-col gap-2">
              <Label>{m.programs_export_templates_label()}</Label>
              <div className="rounded-md border">
                {/* Header row */}
                <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 font-medium text-muted-foreground text-xs">
                  <div className="w-5" />
                  <div className="flex-1">{m.programs_export_meeting_type_label()}</div>
                  <div className="w-20 text-center">{m.programs_export_col_parts()}</div>
                  <div className="w-20 text-center">{m.programs_export_col_services()}</div>
                </div>
                {/* Template rows */}
                {templates.map(template => {
                  const config = configs[template.id]
                  return (
                    <div key={template.id} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
                      <Checkbox
                        checked={config.selected}
                        onCheckedChange={checked => updateConfig(template.id, { selected: checked === true })}
                      />
                      <div className="flex-1 text-sm">{template.name}</div>
                      <div className="flex w-20 justify-center">
                        <Checkbox
                          checked={config.parts}
                          disabled={!config.selected}
                          onCheckedChange={checked => updateConfig(template.id, { parts: checked === true })}
                        />
                      </div>
                      <div className="flex w-20 justify-center">
                        <Checkbox
                          checked={config.services}
                          disabled={!config.selected}
                          onCheckedChange={checked => updateConfig(template.id, { services: checked === true })}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {!hasSelection && <p className="text-destructive text-xs">{m.programs_export_no_selection()}</p>}
            </div>

            {/* Grouping option */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="groupBy">{m.programs_export_group_by_label()}</Label>
              <Select value={groupBy} onValueChange={v => setGroupBy(v as 'date' | 'template')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">{m.programs_export_group_by_date()}</SelectItem>
                  <SelectItem value="template">{m.programs_export_group_by_template()}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Download button */}
            {hasSelection ? (
              <Button asChild className="w-fit">
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  {m.programs_export_download_button()}
                </a>
              </Button>
            ) : (
              <Button disabled className="w-fit">
                {m.programs_export_download_button()}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
