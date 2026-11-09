import { Tag } from '@unitae/ui'
import { Link } from 'react-router'
import type { ReadBadge } from '~/features/display-board/model/read-state'
import type { BoardCard as BoardCardData } from '~/features/display-board/server/board-home.queries'
import { DocumentSheet } from '~/features/display-board/ui/DocumentSheet'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { cn } from '~/shared/utils/utils'

function badgeLabel(badge: ReadBadge): string | null {
  if (badge === 'new') return m.board_badge_new()
  if (badge === 'updated') return m.board_badge_updated()
  return null
}

function untilLabel(date: Date, timeZone: string): string {
  return m.board_meta_until({
    date: new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', timeZone }).format(date),
  })
}

/** What a card says under its title: when it arrived or changed, and when it leaves the board. */
function CardMeta({ card, timeZone }: { card: BoardCardData; timeZone: string }) {
  const parts: React.ReactNode[] = []
  if (card.kind === 'dynamic') {
    if (card.preview) parts.push(card.preview)
    if (card.changedAt) {
      parts.push(
        <>
          {m.board_meta_updated()} <RelativeTime date={card.changedAt} />
        </>,
      )
    }
  }
  if (card.kind === 'pdf' && card.replacedAt) {
    parts.push(
      <>
        {m.board_meta_replaced()} <RelativeTime date={card.replacedAt} />
      </>,
    )
  } else if (parts.length === 0) {
    parts.push(
      <>
        {m.board_meta_added()} <RelativeTime date={card.createdAt} />
      </>,
    )
  }
  if (card.visibleUntil) parts.push(untilLabel(card.visibleUntil, timeZone))

  return (
    <>
      {parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sequence of facts, never reordered
        <span key={index}>
          {index > 0 && ' · '}
          {part}
        </span>
      ))}
    </>
  )
}

interface BoardCardProps {
  card: BoardCardData
  timeZone: string
  /** « À la une »: the sheet beside the text, which says what kind of document it is. */
  featured?: boolean
}

export function BoardCard({ card, timeZone, featured = false }: BoardCardProps) {
  const href = card.kind === 'pdf' ? `/board/documents/${card.id}/viewer` : `/board/dynamic/${card.id}/viewer`
  const badge = badgeLabel(card.badge)

  return (
    <Link
      to={href}
      className={cn(
        'group flex overflow-hidden rounded-lg border border-border bg-surface outline-hidden transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring',
        featured ? 'flex-row' : 'flex-col max-sm:flex-row',
      )}
    >
      <div
        className={cn(
          'relative shrink-0 border-border',
          featured
            ? 'w-[42%] border-r max-sm:w-20'
            : 'aspect-[4/3] border-b max-sm:aspect-auto max-sm:w-16 max-sm:border-r max-sm:border-b-0',
        )}
      >
        <DocumentSheet card={card} className={featured ? 'min-h-36 max-sm:min-h-24' : undefined} />
        {badge && (
          <Tag tone={card.badge === 'new' ? 'brand' : 'neutral'} className="absolute top-2 left-2 max-sm:hidden">
            {badge}
          </Tag>
        )}
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-col',
          featured ? 'justify-center gap-1 p-4' : 'gap-0.5 px-3 pt-2.5 pb-3 max-sm:py-2.5',
        )}
      >
        {featured && (
          <span className="font-medium text-faint text-xs">
            {card.kind === 'dynamic' ? m.board_eyebrow_dynamic() : m.board_eyebrow_pdf()}
          </span>
        )}
        <span
          className={cn('flex items-start gap-2 leading-snug', card.unread && 'font-semibold', featured && 'text-base')}
        >
          {card.unread && <span aria-hidden="true" className="mt-[7px] size-[7px] shrink-0 rounded-full bg-brand" />}
          <span className="line-clamp-2">{card.title}</span>
          {card.unread && <span className="sr-only">{m.board_badge_unread()}</span>}
        </span>
        <span className="text-faint text-sm">
          {/* On a phone the sheet is too small for its badge. « Mis à jour » needs no stand-in:
              the line already says when it was replaced or updated. */}
          {card.badge === 'new' && <span className="sm:hidden">{badge} · </span>}
          <CardMeta card={card} timeZone={timeZone} />
        </span>
      </div>
    </Link>
  )
}
