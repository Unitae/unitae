import { FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, redirect, useFetcher, useSearchParams } from 'react-router'
import { documentReads } from '~/features/display-board/server/board-audience.queries'
import { listBoardManagement, type ManagedItem } from '~/features/display-board/server/board-management.queries'
import { ManageSelectionBar } from '~/features/display-board/ui/manage/ManageSelectionBar'
import { ManageTable } from '~/features/display-board/ui/manage/ManageTable'
import { ManageToolbar } from '~/features/display-board/ui/manage/ManageToolbar'
import {
  filterSections,
  type ItemPayload,
  mergeVisibleOrder,
  type PendingHighlight,
  toPayload,
  withPendingHighlight,
  withPendingOrder,
} from '~/features/display-board/ui/manage/manage-list'
import { itemKey, type ManageRights } from '~/features/display-board/ui/manage/manage-rights'
import { ReadsPanel } from '~/features/display-board/ui/manage/ReadsPanel'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => [{ title: `${m.sidebar_board_manage()} - Unitae` }]

const READS_PARAM = /^(pdf|dynamic)-(\d+)$/

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const rights: ManageRights = {
    canUpload: permissions.has(Permission.CanUploadBoardDocuments),
    canReview: permissions.has(Permission.CanReviewBoardDocuments),
    canOrganise: permissions.has(Permission.CanOrganiseBoardDocuments),
    canConfigureSections: permissions.has(Permission.CanConfigureBoardSections),
    canManageDynamic: permissions.has(Permission.CanManageDynamicBoardDocuments),
  }
  // The page opens to anyone holding one of the rights its actions check; each action shows only with its own.
  if (!Object.values(rights).some(Boolean)) throw redirect('/')

  const match = rights.canReview ? READS_PARAM.exec(new URL(request.url).searchParams.get('lectures') ?? '') : null
  const target = match ? { kind: match[1] as 'pdf' | 'dynamic', id: Number(match[2]) } : null
  const { timezone } = context.get(congregationContext)
  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const now = new Date()
    const [list, reads] = await Promise.all([
      listBoardManagement(db, { congregationId, userId: currentUser.id, now }),
      target ? documentReads(db, { ...target, congregationId, now }) : null,
    ])
    if (reads && target) {
      audit({
        action: AuditAction.BoardReadStatusViewed,
        congregationId,
        actorId: currentUser.id,
        entityType: target.kind === 'pdf' ? 'BoardDocument' : 'BoardDynamicDocumentSettings',
        entityId: target.id,
      })
    }
    return {
      sections: list.sections,
      reads,
      readsKey: reads && target ? `${target.kind}-${target.id}` : null,
      rights,
      timeZone: timezone,
    }
  })
}

export default function ManageBoardPage({ loaderData }: Route.ComponentProps) {
  const { sections, reads, readsKey, rights, timeZone } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const reorder = useFetcher()
  const bulk = useFetcher()
  const highlight = useFetcher()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const pendingOrder = (reorder.json as { orderedItems?: ItemPayload[] } | undefined)?.orderedItems
  const pendingHighlight = highlight.json as PendingHighlight | undefined
  const ordered = withPendingHighlight(withPendingOrder(sections, pendingOrder), pendingHighlight)
  const shown = filterSections(ordered, searchParams)
  const total = sections.reduce((count, s) => count + s.items.length, 0)
  const selectedItems = ordered.flatMap(s => s.items).filter(item => selected.has(itemKey(item)))
  const send = (fetcher: typeof bulk, action: string, body: Record<string, ItemPayload[] | number | boolean>) =>
    fetcher.submit(body, { method: 'POST', action: `/board/documents/${action}`, encType: 'application/json' })
  const move = (items: ManagedItem[], sectionId: number) =>
    send(bulk, 'bulk-move', { items: items.map(toPayload), sectionId })
  const setHighlighted = (items: ManagedItem[], highlighted: boolean) =>
    send(highlight, 'bulk-highlight', { items: items.map(toPayload), highlighted })
  const onSelection = (run: () => void) => {
    run()
    setSelected(new Set())
  }

  return (
    <>
      <PageHeader
        title={m.sidebar_board_manage()}
        titleBadge={
          <span className="text-base text-faint tabular-nums">
            {m.board_manage_count_documents({ count: total })} ·{' '}
            {m.board_manage_count_sections({ count: sections.length })}
          </span>
        }
        breadcrumbs={[{ label: m.board_page_title(), to: '/board' }, { label: m.sidebar_board_manage() }]}
        actions={
          <>
            {rights.canConfigureSections && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/board/sections/new">
                  <Plus className="size-4" aria-hidden="true" />
                  {m.board_manage_add_section()}
                </Link>
              </Button>
            )}
            {rights.canManageDynamic && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/board/documents/new-dynamic">
                  <Plus className="size-4" aria-hidden="true" />
                  {m.board_manage_add_dynamic()}
                </Link>
              </Button>
            )}
            {rights.canUpload && (
              <Button size="sm" asChild>
                <Link to="/board/documents/new">
                  <Plus className="size-4" aria-hidden="true" />
                  {m.board_manage_upload()}
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="flex items-start gap-6" data-sticky-content={reads ? '' : undefined}>
        {/* No width of its own to give: the table scrolls in its frame rather than widen the page. */}
        <div className="flex w-0 min-w-0 flex-1 flex-col">
          {sections.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={m.board_empty_manager_title()}
              description={m.board_empty_manager_description()}
              action={
                rights.canConfigureSections ? (
                  <Button asChild>
                    <Link to="/board/sections/new">{m.board_empty_manager_action()}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              <ManageToolbar sections={sections} canReorder={rights.canOrganise} />
              {shown.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground text-sm">{m.board_manage_no_match()}</p>
              ) : (
                <ManageTable
                  sections={shown}
                  sectionOrder={sections.map(s => s.id)}
                  rights={rights}
                  selected={selected}
                  onToggle={key =>
                    setSelected(prev => {
                      const next = new Set(prev)
                      if (!next.delete(key)) next.add(key)
                      return next
                    })
                  }
                  onReorder={visible => {
                    // The whole section goes back, the rows a search hides in their places.
                    const section = ordered.find(s => s.items.some(item => itemKey(item) === itemKey(visible[0])))
                    const items = section ? mergeVisibleOrder(section.items, visible) : visible
                    reorder.submit(
                      { orderedItems: items.map(toPayload) },
                      {
                        method: 'POST',
                        action: '/board/documents/reorder',
                        encType: 'application/json',
                      },
                    )
                  }}
                  readsKey={readsKey}
                  timeZone={timeZone}
                  compact={reads != null}
                  allSections={sections}
                  onMove={(item, sectionId) => move([item], sectionId)}
                  onHighlight={setHighlighted}
                />
              )}
            </div>
          )}
        </div>

        {reads && (
          <ReadsPanel
            key={readsKey}
            reads={reads}
            onClose={() =>
              setSearchParams(
                prev => {
                  prev.delete('lectures')
                  return prev
                },
                { preventScrollReset: true },
              )
            }
          />
        )}

        {rights.canOrganise && selectedItems.length > 0 && (
          <ManageSelectionBar
            selected={selectedItems}
            sections={sections}
            rights={rights}
            onMove={sectionId => onSelection(() => move(selectedItems, sectionId))}
            onHighlight={value => onSelection(() => setHighlighted(selectedItems, value))}
            onDelete={() => onSelection(() => send(bulk, 'bulk-delete', { items: selectedItems.map(toPayload) }))}
            onClear={() => setSelected(new Set())}
          />
        )}
      </div>
    </>
  )
}
