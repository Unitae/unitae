import { useState } from 'react'
import { type ProgrammeDynamicConfig, parseProgrammeConfig } from '~/features/display-board/model/dynamic-document.type'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

// The programme's display options on its edit page: which meeting types it shows, with their parts
// and their services, and how it groups them. Submitted with the form as `dynamicConfig` JSON.

interface TemplateConfig {
  selected: boolean
  parts: boolean
  services: boolean
}

export function ProgrammeConfigFields({
  templates,
  storedConfig,
  onChange,
}: {
  templates: { id: number; name: string }[]
  storedConfig: unknown
  onChange: () => void
}) {
  const existingConfig = parseProgrammeConfig(storedConfig)

  // Every template selected with parts and services until the document says otherwise.
  const [templateConfigs, setTemplateConfigs] = useState<Record<number, TemplateConfig>>(() => {
    const configMap = new Map(existingConfig?.templates.map(t => [t.templateId, t]))
    return Object.fromEntries(
      templates.map(t => {
        const existing = configMap.get(t.id)
        return [
          t.id,
          existingConfig
            ? { selected: !!existing, parts: existing?.parts ?? true, services: existing?.services ?? true }
            : { selected: true, parts: true, services: true },
        ]
      }),
    )
  })
  const [groupBy, setGroupBy] = useState<'date' | 'template'>(existingConfig?.groupBy ?? 'date')

  function updateTemplateConfig(templateId: number, patch: Partial<TemplateConfig>) {
    setTemplateConfigs(prev => ({ ...prev, [templateId]: { ...prev[templateId], ...patch } }))
    onChange()
  }

  const dynamicConfig: ProgrammeDynamicConfig = {
    templates: Object.entries(templateConfigs)
      .filter(([_, c]) => c.selected && (c.parts || c.services))
      .map(([id, c]) => ({ templateId: Number(id), parts: c.parts, services: c.services })),
    groupBy,
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">{m.board_dynamic_display_options_title()}</h3>

        <div className="flex flex-col gap-2">
          <Label>{m.programs_export_templates_label()}</Label>
          <div className="rounded-md border">
            <div className="bg-muted/50 text-muted-foreground flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
              <div className="w-5" />
              <div className="flex-1">{m.programs_export_meeting_type_label()}</div>
              <div className="w-20 text-center">{m.programs_export_col_parts()}</div>
              <div className="w-20 text-center">{m.programs_export_col_services()}</div>
            </div>
            {templates.map(template => {
              const config = templateConfigs[template.id]
              return (
                <div key={template.id} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
                  <Checkbox
                    checked={config.selected}
                    onCheckedChange={checked => updateTemplateConfig(template.id, { selected: checked === true })}
                  />
                  <div className="flex-1 text-sm">{template.name}</div>
                  <div className="flex w-20 justify-center">
                    <Checkbox
                      checked={config.parts}
                      disabled={!config.selected}
                      onCheckedChange={checked => updateTemplateConfig(template.id, { parts: checked === true })}
                    />
                  </div>
                  <div className="flex w-20 justify-center">
                    <Checkbox
                      checked={config.services}
                      disabled={!config.selected}
                      onCheckedChange={checked => updateTemplateConfig(template.id, { services: checked === true })}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{m.programs_export_group_by_label()}</Label>
          <Select
            value={groupBy}
            onValueChange={v => {
              setGroupBy(v as 'date' | 'template')
              onChange()
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">{m.programs_export_group_by_date()}</SelectItem>
              <SelectItem value="template">{m.programs_export_group_by_template()}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <input type="hidden" name="dynamicConfig" value={JSON.stringify(dynamicConfig)} />
      </CardContent>
    </Card>
  )
}
