import { SegmentedControl } from '@unitae/ui'
import { CheckCheck, FileText } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { type BoardCard as BoardCardData, loadBoardHome } from '~/features/display-board/server/board-home.queries'
import { BoardCard } from '~/features/display-board/ui/BoardCard'
import { BoardSection } from '~/features/display-board/ui/BoardSection'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { usePersistedState } from '~/shared/ui/hooks/use-persisted-state'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewBoard)
  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)

  const home = await withScopeFromContext(context, db =>
    loadBoardHome(db, { userId: currentUser.id, congregationId: currentUser.congregationId, now: new Date() }),
  )

  return {
    ...home,
    timeZone: timezone,
    // Each link behind the right its page checks.
    canManageDocuments:
      permissions.has(Permission.CanUploadBoardDocuments) || permissions.has(Permission.CanReviewBoardDocuments),
    canConfigureSections: permissions.has(Permission.CanConfigureBoardSections),
  }
}

type Filter = 'all' | 'unread'

export default function BoardPage({ loaderData }: Route.ComponentProps) {
  const { highlighted, sections, unreadCount, timeZone, canManageDocuments, canConfigureSections } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const [collapsed, setCollapsed] = usePersistedState<Record<number, boolean>>('board-collapsed', {})
  const filter: Filter = searchParams.get('vue') === 'non-lus' ? 'unread' : 'all'

  const keep = (cards: BoardCardData[]) => (filter === 'unread' ? cards.filter(card => card.unread) : cards)
  const shownHighlighted = keep(highlighted)
  const shownSections = sections
    .map(section => ({ ...section, cards: keep(section.cards) }))
    .filter(section => section.cards.length > 0)
  const isEmpty = highlighted.length === 0 && sections.length === 0

  return (
    <>
      <PageHeader
        title={m.board_page_title()}
        controls={
          isEmpty ? undefined : (
            <SegmentedControl
              aria-label={m.board_filter_label()}
              size="sm"
              value={filter}
              onValueChange={value =>
                setSearchParams(value === 'unread' ? { vue: 'non-lus' } : {}, {
                  replace: true,
                  preventScrollReset: true,
                })
              }
              options={[
                { value: 'all', label: m.board_filter_all() },
                { value: 'unread', label: m.board_filter_unread({ count: unreadCount }) },
              ]}
            />
          )
        }
        actions={
          <>
            {/* On a phone both live in the « Plus » sheet. */}
            {canConfigureSections && (
              <Button variant="ghost" size="sm" asChild className="max-md:hidden">
                <Link to="/board/sections">{m.board_manage_sections()}</Link>
              </Button>
            )}
            {canManageDocuments && (
              <Button variant="outline" size="sm" asChild className="max-md:hidden">
                <Link to="/board/documents">
                  <FileText className="size-4" aria-hidden="true" />
                  {m.board_manage_documents()}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {isEmpty ? (
        <EmptyBoard canConfigureSections={canConfigureSections} />
      ) : shownHighlighted.length === 0 && shownSections.length === 0 ? (
        <EmptyState icon={CheckCheck} title={m.board_all_read_title()} description={m.board_all_read_description()} />
      ) : (
        <div className="flex flex-col gap-9">
          {shownHighlighted.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-baseline gap-2.5 font-semibold text-[15px]">
                {m.board_highlighted_heading()}
                <span className="font-normal text-faint text-sm tabular-nums">{shownHighlighted.length}</span>
              </h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4 max-sm:gap-2">
                {shownHighlighted.map(card => (
                  <BoardCard key={`${card.kind}-${card.id}`} card={card} timeZone={timeZone} featured />
                ))}
              </div>
            </section>
          )}
          {shownSections.map(section => (
            <BoardSection
              key={section.id}
              name={section.name}
              cards={section.cards}
              collapsed={collapsed[section.id] ?? false}
              onToggle={() => setCollapsed({ ...collapsed, [section.id]: !collapsed[section.id] })}
              timeZone={timeZone}
            />
          ))}
        </div>
      )}
    </>
  )
}

function EmptyBoard({ canConfigureSections }: { canConfigureSections: boolean }) {
  if (!canConfigureSections) {
    return <EmptyState icon={FileText} title={m.board_empty_title()} description={m.board_empty_description()} />
  }
  return (
    <EmptyState
      icon={FileText}
      title={m.board_empty_manager_title()}
      description={m.board_empty_manager_description()}
      action={
        <Button asChild>
          <Link to="/board/sections">{m.board_empty_manager_action()}</Link>
        </Button>
      }
    />
  )
}
