import { useState } from 'react'
import { type ProgrammeDynamicConfig, parseProgrammeConfig } from '~/features/display-board/model/dynamic-document.type'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

// A programme's content, in its form's « Contenu » section: which meeting types it shows, with their parts
// and their services, and how it groups them. Submitted with the form as `dynamicConfig` JSON. A type using several
// duties templates lets choose which of their schedules it shows (user, 2026-11-27); all of them are stored as none
// named, so a template the type comes to use shows too.

interface TemplateConfig {
  selected: boolean
  parts: boolean
  services: boolean
  /** Its duties templates shown, when it uses several. */
  dutyTemplates: number[]
}

interface ConfigTemplate {
  id: number
  name: string
  dutyTemplates?: { id: number; title: string | null }[]
}

const choosesDuties = (template: ConfigTemplate) => (template.dutyTemplates?.length ?? 0) > 1

export function ProgrammeConfigFields({
  templates,
  storedConfig,
  onChange,
}: {
  templates: ConfigTemplate[]
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
        const allDuties = (t.dutyTemplates ?? []).map(each => each.id)
        const dutyTemplates = existing?.dutyTemplates?.filter(id => allDuties.includes(id)) ?? allDuties
        return [
          t.id,
          existingConfig
            ? {
                selected: !!existing,
                parts: existing?.parts ?? true,
                services: existing?.services ?? true,
                dutyTemplates,
              }
            : { selected: true, parts: true, services: true, dutyTemplates },
        ]
      }),
    )
  })
  const [groupBy, setGroupBy] = useState<'date' | 'template'>(existingConfig?.groupBy ?? 'date')

  function updateTemplateConfig(templateId: number, patch: Partial<TemplateConfig>) {
    setTemplateConfigs(prev => ({ ...prev, [templateId]: { ...prev[templateId], ...patch } }))
    onChange()
  }

  // The duties templates chosen, stored only when some are left out.
  const chosenDuties = (template: ConfigTemplate | undefined, config: TemplateConfig) =>
    template != null && choosesDuties(template) && config.dutyTemplates.length < (template.dutyTemplates?.length ?? 0)
      ? { dutyTemplates: config.dutyTemplates }
      : {}
  const dynamicConfig: ProgrammeDynamicConfig = {
    templates: Object.entries(templateConfigs)
      .filter(([_, c]) => c.selected && (c.parts || c.services))
      .map(([id, c]) => ({
        templateId: Number(id),
        parts: c.parts,
        services: c.services,
        ...(c.services
          ? chosenDuties(
              templates.find(t => t.id === Number(id)),
              c,
            )
          : {}),
      })),
    groupBy,
  }

  function toggleDuty(template: ConfigTemplate, dutyId: number, on: boolean) {
    const current = templateConfigs[template.id].dutyTemplates
    const next = on ? [...current, dutyId] : current.filter(id => id !== dutyId)
    // None left: the type shows no services, as unticking its « Services » does.
    updateTemplateConfig(template.id, { dutyTemplates: next, ...(next.length === 0 ? { services: false } : {}) })
  }

  return (
    <div className="col-span-full flex flex-col gap-4">
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
              <div key={template.id} className="border-b last:border-b-0">
                <div className="flex items-center gap-3 px-3 py-2.5">
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
                      onCheckedChange={checked =>
                        updateTemplateConfig(template.id, {
                          services: checked === true,
                          // Ticked again, with none of its schedules chosen: every one.
                          ...(checked === true && config.dutyTemplates.length === 0
                            ? { dutyTemplates: (template.dutyTemplates ?? []).map(each => each.id) }
                            : {}),
                        })
                      }
                    />
                  </div>
                </div>
                {choosesDuties(template) && config.selected && config.services && (
                  <fieldset className="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-2.5 pl-11">
                    <legend className="sr-only">{m.board_programme_services_schedules({ type: template.name })}</legend>
                    {template.dutyTemplates?.map(duty => (
                      <Label
                        key={duty.id}
                        className="flex items-center gap-2 font-normal text-muted-foreground text-sm"
                      >
                        <Checkbox
                          checked={config.dutyTemplates.includes(duty.id)}
                          onCheckedChange={checked => toggleDuty(template, duty.id, checked === true)}
                        />
                        {duty.title ?? m.board_programme_services_title()}
                      </Label>
                    ))}
                  </fieldset>
                )}
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
    </div>
  )
}
