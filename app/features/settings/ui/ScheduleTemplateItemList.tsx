import { Callout } from '@unitae/ui'
import { Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ListedPart, PartDraft } from '~/features/settings/model/schedule-template-list'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName, type RoleOption } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { type ItemKind, itemMark } from './item-mark'
import { Movable, OrderArea, type OrderControls, topId } from './TemplateOrder'
import { TemplatePartRuns } from './TemplatePartRuns'

/** What a part's row says: who may take it. */
export interface ItemListPart extends ListedPart {
  allowedSpeakerRoleIds: number[]
  allowedReaderRoleIds: number[]
  presetId: number | null
  speakerLabel?: string | null
  readerLabel?: string | null
  allowExternalSpeaker?: boolean
}

export interface ItemListService {
  id: number
  name: string
  allowedRoleIds: number[]
}

export type { ItemKind, PartDraft }

export { itemMark }

const serviceRowClass =
  'flex min-w-0 flex-1 min-h-12 items-center gap-3 px-3 py-1.5 text-left text-sm outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
const detailClass = 'block truncate text-faint text-xs'

/**
 * A schedule template's parts (by section, a section's halls nested, with the times) or services, as the design
 * round A board draws them. A row opens the item at the panel's second level.
 */
export function ScheduleTemplateItemList({
  kind,
  parts,
  services,
  roles,
  presets,
  onOpen,
  onAdd,
  controls = null,
  onReorder,
  announcement = '',
  refusal = '',
}: {
  kind: ItemKind
  parts: ItemListPart[]
  services: ItemListService[]
  roles: RoleOption[]
  /** The part types, which say whether a part has a second speaker. */
  presets: {
    id: number
    speakerLabel: string | null
    readerLabel: string | null
    hasReaderSlot: boolean
    allowExternalSpeaker: boolean
  }[]
  onOpen: (kind: ItemKind, id: number) => void
  onAdd: (kind: ItemKind, draft?: PartDraft) => void
  /** How the parts move: dragged on a wide screen, up and down while « Réorganiser » is on (a phone). */
  controls?: OrderControls | null
  /** « Réorganiser les parties » (a phone), or « Terminé » while on. */
  onReorder?: () => void
  /** What the last move did, said to the reader (and shown while reordering). */
  announcement?: string
  /** Why the last move was refused. */
  refusal?: string
}) {
  const [newSection, setNewSection] = useState<string | null>(null)
  const newSectionId = useId()
  const newSectionError = useId()
  // Back on « Ajouter une section » once its name is dropped: focus stays in the panel, Escape with it.
  const addSection = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const dropNewSection = () => {
    refocus.current = true
    setNewSection(null)
  }
  useEffect(() => {
    if (newSection != null || !refocus.current) return
    refocus.current = false
    addSection.current?.focus()
  }, [newSection])
  const roleNames = (ids: number[]) =>
    roles
      .filter(role => ids.includes(role.id))
      .map(role => getRoleDisplayName(role))
      .join(', ')

  const reordering = controls?.mode === 'buttons'
  // The list's title row (« Réorganiser … » / « Terminé » on a phone), what moving does, why the last move was refused,
  // and what it did: the same for parts and services.
  const orderHeader = (label: string, reorderLabel: string, hint: string, count: number) => (
    <>
      <div className="flex min-h-9 items-center justify-between gap-2">
        <span className="font-medium text-sm">{reordering ? reorderLabel : label}</span>
        {/* « Terminé » stays while on, even once the list is down to one item. */}
        {onReorder != null && (reordering || count > 1) && (
          <Button type="button" variant={reordering ? 'default' : 'ghost'} size="sm" onClick={onReorder}>
            {reordering ? m.settings_schedule_templates_reorder_done() : reorderLabel}
          </Button>
        )}
      </div>
      {reordering && <p className="text-faint text-xs">{hint}</p>}
      {refusal !== '' && (
        <Callout tone="danger" role="alert">
          {refusal}
        </Callout>
      )}
      {/* What the last move did: read out, and shown while « Réorganiser » is on, above the list where the tap is. */}
      <p aria-live="polite" className={reordering ? 'text-muted-foreground text-xs' : 'sr-only'}>
        {announcement}
      </p>
    </>
  )

  if (kind === 'service') {
    const serviceKeys = services.map(service => topId(`service:${service.id}`))
    const serviceNames = new Map(services.map((service, index) => [serviceKeys[index] ?? '', service.name]))
    return (
      <div className="flex flex-col gap-2">
        {orderHeader(
          m.settings_schedule_templates_services_label(),
          m.settings_schedule_templates_reorder_services(),
          m.settings_schedule_templates_reorder_services_hint(),
          services.length,
        )}
        {services.length === 0 ? (
          <p className="rounded-md border border-border border-dashed px-3 py-3 text-muted-foreground text-sm">
            {m.settings_schedule_templates_services_empty()}
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <OrderArea controls={controls} topIds={serviceKeys} names={serviceNames}>
              {services.map((service, index) => {
                const body = (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{service.name}</span>
                    <span className={detailClass}>
                      {roleNames(service.allowedRoleIds) || m.settings_schedule_templates_anyone()}
                    </span>
                  </span>
                )
                return (
                  <Movable
                    key={service.id}
                    id={serviceKeys[index] ?? ''}
                    index={index}
                    count={services.length}
                    controls={controls}
                    labels={{
                      drag: m.settings_schedule_templates_move_part({ name: service.name }),
                      up: m.settings_schedule_templates_move_up({ name: service.name }),
                      down: m.settings_schedule_templates_move_down({ name: service.name }),
                    }}
                    onMove={to => controls?.top(index, to, service.name)}
                  >
                    {handle => (
                      <div className="flex items-stretch border-border border-b">
                        {handle}
                        {reordering ? (
                          <div className={serviceRowClass}>{body}</div>
                        ) : (
                          <button
                            type="button"
                            data-item={itemMark('service', service.id)}
                            onClick={() => onOpen('service', service.id)}
                            className={serviceRowClass}
                          >
                            {body}
                          </button>
                        )}
                      </div>
                    )}
                  </Movable>
                )
              })}
            </OrderArea>
          </div>
        )}
        {!reordering && (
          <>
            <AddButton label={m.settings_schedule_templates_add_service()} onClick={() => onAdd('service')} />
            <p className="text-faint text-xs">{m.settings_schedule_templates_list_note()}</p>
          </>
        )}
      </div>
    )
  }

  const sections = [...new Set(parts.map(part => part.section).filter(section => section !== ''))]
  const sectionName = newSection?.trim() ?? ''
  const sectionTaken = sections.includes(sectionName)
  const lastOrder = parts.reduce((max, part) => Math.max(max, part.order), -1)
  const startSection = () => {
    if (sectionName === '' || sectionTaken) return
    onAdd('part', { section: sectionName, track: '', trackOrder: null, order: lastOrder + 1 })
  }
  return (
    <div className="flex flex-col gap-2">
      {orderHeader(
        m.settings_schedule_templates_parts_label(),
        m.settings_schedule_templates_reorder(),
        m.settings_schedule_templates_reorder_hint(),
        parts.length,
      )}
      {parts.length === 0 ? (
        <p className="rounded-md border border-border border-dashed px-3 py-3 text-muted-foreground text-sm">
          {m.settings_template_parts_empty()}
        </p>
      ) : (
        <TemplatePartRuns
          parts={parts}
          roles={roles}
          presets={presets}
          sections={sections}
          lastOrder={lastOrder}
          controls={controls}
          onOpen={id => onOpen('part', id)}
          onAdd={draft => onAdd('part', draft)}
        />
      )}
      {reordering ? null : (
        <>
          {newSection != null && (
            // The phone's sheet hears Escape first: this mark tells it the name takes it, not the panel.
            <div data-own-escape="" className="flex flex-col gap-2 rounded-md border border-border p-2">
              <label htmlFor={newSectionId} className="sr-only">
                {m.settings_schedule_templates_section_name()}
              </label>
              {/* biome-ignore lint/a11y/noAutofocus: the section the person just asked to add */}
              <Input
                id={newSectionId}
                value={newSection}
                onChange={event => setNewSection(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    startSection()
                  }
                  if (event.key !== 'Escape') return
                  event.preventDefault()
                  event.stopPropagation()
                  dropNewSection()
                }}
                aria-invalid={sectionTaken || undefined}
                aria-describedby={sectionTaken ? newSectionError : undefined}
                placeholder={m.settings_schedule_templates_section_name()}
                maxLength={80}
                autoFocus
              />
              {sectionTaken && (
                <p id={newSectionError} role="alert" className="text-danger-text text-xs">
                  {m.settings_schedule_templates_section_taken()}
                </p>
              )}
              <p className="text-faint text-xs">{m.settings_schedule_templates_new_section_hint()}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={sectionName === '' || sectionTaken} onClick={startSection}>
                  <Plus aria-hidden="true" />
                  {m.settings_schedule_templates_first_part()}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={dropNewSection}>
                  {m.common_cancel()}
                </Button>
              </div>
            </div>
          )}
          {/* Hidden while a new section is named: its own « Première partie » is the part to add then. */}
          {newSection == null && (
            <div className="flex flex-wrap gap-2">
              <AddButton
                label={m.settings_schedule_templates_add_part_loose()}
                onClick={() => onAdd('part', { section: '', track: '', trackOrder: null, order: lastOrder + 1 })}
              />
              <AddButton
                ref={addSection}
                label={m.settings_schedule_templates_add_section()}
                onClick={() => setNewSection('')}
              />
            </div>
          )}
          <p className="text-faint text-xs">{m.settings_schedule_templates_list_note()}</p>
        </>
      )}
    </div>
  )
}

function AddButton({
  label,
  onClick,
  ref,
}: {
  label: string
  onClick: () => void
  ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <Button ref={ref} type="button" variant="ghost" size="sm" className="self-start" onClick={onClick}>
      <Plus aria-hidden="true" />
      {label}
    </Button>
  )
}
