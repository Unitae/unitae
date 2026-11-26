import type { ComponentProps } from 'react'
import { PartEditor, ServiceEditor } from '~/features/events'
import { templatePlaces } from '~/features/settings/model/schedule-template-list'
import type { PanelItems } from '~/features/settings/ui/ScheduleTemplatePanel'
import type { OpenItem } from '~/features/settings/ui/use-schedule-template-page'

type Part = PanelItems['parts'][number]
type Service = PanelItems['services'][number]

/** The panel's second level: a template's part or service in its form, a new one from its draft place. */
export function ScheduleTemplateItemEditor({
  item,
  items,
  part,
  service,
  itemFetcher,
  formRef,
}: {
  item: OpenItem
  items: PanelItems
  part: Part | undefined
  service: Service | undefined
  itemFetcher: ComponentProps<typeof PartEditor>['fetcher']
  formRef: ComponentProps<typeof PartEditor>['formRef']
}) {
  const itemForm = { ref: formRef }
  return item.kind === 'part' ? (
    <PartEditor
      key={`part-${item.id ?? `new-${item.draft?.section}-${item.draft?.order}`}`}
      mode="template"
      fetcher={itemFetcher}
      part={
        part ??
        (item.draft == null
          ? null
          : {
              name: '',
              section: item.draft.section,
              track: '',
              order: item.draft.order,
              durationMin: null,
              presetId: null,
              allowedSpeakerRoleIds: [],
              allowedReaderRoleIds: [],
              roomIds: [],
            })
      }
      // After the last part, whatever their numbering (a reorder writes them five apart).
      defaultOrder={items.parts.reduce((max, each) => Math.max(max, each.order), -1) + 1}
      roles={items.roles}
      presets={items.presets}
      sectionSuggestions={items.sectionSuggestions}
      trackSuggestions={[]}
      places={templatePlaces(items.parts, items.rooms)}
      formRef={itemForm.ref}
    />
  ) : (
    <ServiceEditor
      key={`service-${item.id ?? 'new'}`}
      mode="template"
      fetcher={itemFetcher}
      service={service ?? null}
      roles={items.roles}
      formRef={itemForm.ref}
    />
  )
}
