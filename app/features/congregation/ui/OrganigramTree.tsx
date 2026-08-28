import { Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { Badge } from '~/shared/ui/badge'
import { cn } from '~/shared/utils/utils'

// The chart is READ-ONLY on every viewport. Holders stay visible — «qui est le préposé aux
// comptes ?» is the second most common thing anyone asks of it, and answering that without a
// click is the point of the document — but nothing here mutates.
//
// All editing lives in the node panel, reached by selecting a node. That keeps the chart quiet
// on a page that is overwhelmingly read, and removes the accidental-tap risk of putting
// destructive controls in a long scrolling list.
//
// Semantic <ul>/<li>, deliberately NOT the ARIA treeview pattern: VoiceOver treats trees as
// tables, and JAWS/NVDA read every child when a parent takes focus. Nesting is announced natively.

interface Holder {
  memberId: number
  firstname: string | null
  lastname: string | null
  anonymizedAt: Date | null
  kind: string
}

const SEAT_LABEL: Record<string, string> = { leader: 'Responsable', deputy: 'Adjoint' }

function formatName(person: Holder): string {
  if (person.anonymizedAt != null) return m.board_read_status_anonymized_user()
  const lastname = person.lastname?.toLocaleUpperCase() ?? null
  return [person.firstname, lastname].filter(Boolean).join(' ') || '—'
}

/**
 * A seat label, suppressed when the node's own name already carries it.
 *
 * Without this, a node called « Responsable de l'accueil » reads "Responsable de l'accueil ·
 * Responsable". On a real congregation's chart that was eleven redundant labels — most of the page.
 */
function seatLabel(kind: string, nodeName: string): string | null {
  const label = SEAT_LABEL[kind]
  if (!label) return null
  return nodeName.toLocaleLowerCase().startsWith(label.toLocaleLowerCase()) ? null : label
}

function NodeRow({ node, selectedId }: { node: OrganigramNode; selectedId: number | null }) {
  const [searchParams] = useSearchParams()
  const isSelected = selectedId === node.id
  // Deliberately NOT called "vacant". Without a leader/unit distinction in the model we cannot
  // tell a post nobody holds from a group nobody has been added to yet, and an amber warning
  // badge asserted the former on four nodes that were the latter — including one whose note
  // describes its team. "— personne" states only what is true.
  const isEmpty = !node.isRoster && node.holders.length === 0 && node.children.length === 0

  const params = new URLSearchParams(searchParams)
  params.set('node', String(node.id))

  return (
    // 12px of indent per level on a phone, 20px from `sm` up. At depth 6 that is 72px of gutter
    // on a 390px screen instead of 96 — tight but readable — while desktop, which has the room,
    // gets an indent you can actually see.
    <li className="border-border border-l pl-3 sm:pl-5">
      {/*
        The whole row is one target, at least 44px tall — comfortably past the WCAG 2.2 minimum
        and sized for the demographic, instead of three 24px icons. `preventScrollReset` keeps
        the reader's place when the panel opens.
      */}
      <Link
        to={{ search: params.toString() }}
        preventScrollReset
        aria-current={isSelected ? 'true' : undefined}
        className={cn(
          '-mx-2 flex min-h-11 items-start gap-2 rounded-md border-l-2 border-l-transparent px-2 py-1.5',
          'transition-colors hover:bg-accent/60',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          // The selected row is where every form in the panel applies, so it has to be obvious
          // at a glance — a faint background alone was not enough to find it in 12 rows.
          isSelected && 'border-l-primary bg-accent',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            {/* The rosters are a different kind of thing — reconciled from Member flags rather
                than appointed — so they read as a heading rather than as another service. */}
            {node.isRoster && <Users aria-hidden="true" className="size-3.5 text-muted-foreground" />}
            <span
              className={cn(
                'text-sm',
                node.isRoster ? 'font-semibold uppercase tracking-wide' : 'font-medium',
                isEmpty && 'text-muted-foreground',
              )}
            >
              {node.name}
            </span>
            {node.isRoster && <Badge variant="outline">{node.holders.length}</Badge>}
            {isEmpty && <span className="text-muted-foreground text-xs">— personne</span>}
          </span>

          {node.holders.length > 0 && (
            // Several people on one line ran together — "RESPONSABLE Nicolas LAURENT ADJOINT
            // David LEFÈVRE Julien GIRARD" is unreadable. A separator between people, and the
            // seat label tied tightly to the name it qualifies.
            <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-muted-foreground text-sm">
              {node.holders.map((holder, index) => {
                const label = seatLabel(holder.kind, node.name)
                return (
                  <span key={`${holder.memberId}-${holder.kind}`} className="whitespace-nowrap">
                    {index > 0 && (
                      <span aria-hidden="true" className="pr-1 text-muted-foreground/40">
                        ·
                      </span>
                    )}
                    {label && <span className="text-[0.7rem] uppercase tracking-wide opacity-70">{label} </span>}
                    <span className="text-foreground/80">{formatName(holder)}</span>
                  </span>
                )
              })}
            </span>
          )}

          {node.note && <span className="text-muted-foreground text-xs italic">{node.note}</span>}
        </span>
      </Link>

      {node.children.length > 0 && (
        <ul className="flex flex-col">
          {node.children.map(child => (
            <NodeRow key={child.id} node={child} selectedId={selectedId} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function OrganigramTree({ tree, selectedId = null }: { tree: OrganigramNode[]; selectedId?: number | null }) {
  return (
    <ul className="flex flex-col">
      {tree.map(node => (
        <NodeRow key={node.id} node={node} selectedId={selectedId} />
      ))}
    </ul>
  )
}
