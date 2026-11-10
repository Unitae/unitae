import { SidePanel } from '@unitae/ui'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { type ReactNode, type Ref, useEffect, useState } from 'react'
import { Link, useFetcher } from 'react-router'

import type { AssignPanelData, AttributionPanelData } from '~/features/territories/server/attribution-panel.queries'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { Skeleton } from '~/shared/ui/skeleton'
import {
  CancelAttributionDialog,
  type DialogAttribution,
  PANEL_ROUTE,
  ReturnAttributionDialog,
} from './AttributionDialogs'
import { AttributionAssignForm, AttributionEditForm } from './AttributionPanelForm'
import { holderName } from './attribution-labels'
import { territoryKindLabel, territoryQuantityLabel } from './my-territory-labels'

const FORM_ID = 'attribution-form'

type Loaded = { ok: true; today: string; phoneMethod: boolean } & (
  | ({ mode: 'edit' } & AttributionPanelData)
  | ({ mode: 'assign' } & AssignPanelData)
)
type LoadResult = Loaded | { ok: false; reason: string }

/** What the panel opens: one attribution to change, or a territory to attribute. */
export interface AttributionTarget {
  kind: 'attribution' | 'territory'
  id: number
  trigger: HTMLElement | null
}

/** The attributions around the open one, so ↑ and ↓ walk the list without going back to it. */
export interface AttributionWalk {
  position: number
  total: number
  onPrevious: () => void
  onNext: () => void
}

interface AttributionPanelProps {
  target: AttributionTarget
  /** Docked beside the list from 1280 px; a sheet over the page below. */
  docked: boolean
  formRef?: Ref<HTMLFormElement>
  /** × and Escape: the host asks first while the docked form holds changes. */
  onRequestClose: () => void
  /** Closes without asking: « Annuler », a save, a rentrer, a cancel. */
  onClose: () => void
  walk: AttributionWalk | null
}

/**
 * One attribution, or a territory to attribute, beside the list or over it: loaded from the panel route, saved back
 * to it. « Rentrer » and « Annuler l'attribution » open their dialogs from here.
 */
export function AttributionPanel({ target, docked, formRef, onRequestClose, onClose, walk }: AttributionPanelProps) {
  const loader = useFetcher<LoadResult>()
  const saver = useFetcher()
  const resumer = useFetcher()
  const [returning, setReturning] = useState<DialogAttribution | null>(null)
  const [cancelling, setCancelling] = useState<DialogAttribution | null>(null)
  const query = `${target.kind}=${target.id}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    loader.load(`${PANEL_ROUTE}?${query}`)
  }, [query])

  useCloseOnSave(saver, onClose)
  useCloseOnSave(resumer, onClose)

  const data = loader.data?.ok ? loader.data : null
  const failed = loader.data != null && !loader.data.ok
  const dialogTarget = data?.mode === 'edit' ? dialogAttribution(data) : null
  const busy = saver.state !== 'idle' || resumer.state !== 'idle'

  const title = data == null ? m.attributions_panel_loading() : panelTitle(data)
  const description = data && <PanelDescription data={data} />

  const body = (
    <PanelBody failed={failed} ready={data != null}>
      {data?.mode === 'edit' && (
        <AttributionEditForm
          key={data.attribution.id}
          data={data}
          fetcher={saver}
          formId={FORM_ID}
          formRef={formRef}
          today={data.today}
          phoneMethod={data.phoneMethod}
          onCancel={() => setCancelling(dialogTarget)}
          onResume={() =>
            resumer.submit({ intent: 'resume', id: data.attribution.id }, { method: 'post', action: PANEL_ROUTE })
          }
        />
      )}
      {data?.mode === 'assign' && (
        <AttributionAssignForm
          key={data.territory.id}
          data={data}
          fetcher={saver}
          formId={FORM_ID}
          formRef={formRef}
          today={data.today}
          phoneMethod={data.phoneMethod}
        />
      )}
    </PanelBody>
  )

  const footer = data && (
    <PanelFooter data={data} walk={walk} busy={busy} onReturn={() => setReturning(dialogTarget)} onClose={onClose} />
  )

  const dialogs = data?.mode === 'edit' && (
    <>
      <ReturnAttributionDialog
        attribution={returning}
        today={data.today}
        onOpenChange={open => {
          if (!open) setReturning(null)
        }}
      />
      <CancelAttributionDialog
        attribution={cancelling}
        onOpenChange={open => {
          if (!open) setCancelling(null)
        }}
        onCancelled={onClose}
      />
    </>
  )

  if (docked) {
    return (
      <SidePanel
        title={title}
        description={description}
        closeLabel={m.common_close()}
        onClose={onRequestClose}
        returnFocus={target.trigger}
        footer={footer}
      >
        {body}
        {dialogs}
      </SidePanel>
    )
  }

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription asChild>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        {footer && <SheetFooter className="border-border border-t">{footer}</SheetFooter>}
        {dialogs}
      </SheetContent>
    </Sheet>
  )
}

function panelTitle(data: Loaded): string {
  return data.mode === 'edit'
    ? m.attributions_panel_title({ number: data.territory.number })
    : m.attributions_panel_assign_title({ number: data.territory.number })
}

/** « Porte à porte · 98 foyers · Voir le territoire ». */
function PanelDescription({ data }: { data: Loaded }) {
  const { territory } = data
  return (
    <span className="tabular-nums">
      {territoryKindLabel(territory.type)} · {territoryQuantityLabel(territory.type, territory.quantity)} ·{' '}
      <Link
        to={`/territories/territory/${territory.id}/view`}
        className="text-brand-text underline-offset-4 hover:underline"
      >
        {m.attributions_panel_see_territory()}
      </Link>
    </span>
  )
}

function dialogAttribution(data: { mode: 'edit' } & AttributionPanelData): DialogAttribution {
  return {
    id: data.attribution.id,
    number: data.territory.number,
    holder: holderName(data.publisher),
    startDay: data.attribution.startDay,
    restDays: data.attribution.restDays,
  }
}

function WalkControls({ walk }: { walk: AttributionWalk }) {
  return (
    <span className="flex items-center gap-1 text-faint text-xs">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.attributions_panel_previous()}
        onClick={walk.onPrevious}
      >
        <ChevronUp />
      </Button>
      <span className="tabular-nums">{m.attributions_panel_walk({ position: walk.position, total: walk.total })}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.attributions_panel_next()}
        onClick={walk.onNext}
      >
        <ChevronDown />
      </Button>
    </span>
  )
}

/** The form once loaded; a placeholder before, a message when it cannot be opened. */
function PanelBody({ failed, ready, children }: { failed: boolean; ready: boolean; children: ReactNode }) {
  if (failed) return <p className="text-muted-foreground text-sm">{m.attributions_panel_unavailable()}</p>
  if (ready) return children
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}

/** An attribution: the walk through the list, « Rentrer… » and save. A territory: cancel and attribute. */
function PanelFooter({
  data,
  walk,
  busy,
  onReturn,
  onClose,
}: {
  data: Loaded
  walk: AttributionWalk | null
  busy: boolean
  onReturn: () => void
  onClose: () => void
}) {
  if (data.mode === 'assign') {
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {m.common_cancel()}
        </Button>
        <SubmitButton form={FORM_ID} disabled={busy}>
          {m.attributions_panel_assign_submit({ number: data.territory.number })}
        </SubmitButton>
      </div>
    )
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {walk != null && walk.total > 1 && <WalkControls walk={walk} />}
      <span className="flex-1" />
      {data.attribution.state !== 'paused' && (
        <Button type="button" variant="outline" onClick={onReturn} disabled={busy}>
          {m.attributions_row_return()}
        </Button>
      )}
      <SubmitButton form={FORM_ID} disabled={busy}>
        {m.common_save()}
      </SubmitButton>
    </div>
  )
}
