import { Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { toLayout } from '~/features/congregation/ui/organigram-layout'
import * as m from '~/i18n/paraglide/messages'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { Badge } from '~/shared/ui/badge'
import { cn } from '~/shared/utils/utils'

// The chart is READ-ONLY on every viewport. Holders stay visible — «qui est le préposé aux
// comptes ?» is the second most common thing anyone asks of it — but nothing here mutates. All
// editing lives in the node panel, reached by selecting a row.
//
// Laid out in bands rather than nested indentation, which is what the printed sheet does: a
// header names the group, its members are rows beneath it, and depth costs no horizontal space.
// The old version lost ~15% of a 390px screen per level and was unreadable by depth 6.

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

/** Suppressed when the node's own name already carries it — «Responsable de l'accueil · Responsable». */
function seatLabel(kind: string, nodeName: string): string | null {
  const label = SEAT_LABEL[kind]
  if (!label) return null
  return nodeName.toLocaleLowerCase().startsWith(label.toLocaleLowerCase()) ? null : label
}

function Holders({ node }: { node: OrganigramNode }) {
  if (node.holders.length === 0) return null
  return (
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
  )
}

function useNodeHref(nodeId: number) {
  const [searchParams] = useSearchParams()
  const params = new URLSearchParams(searchParams)
  params.set('node', String(nodeId))
  return params.toString()
}

/** One selectable line: the name on the left, the people on the right where there is room. */
function Row({
  node,
  selectedId,
  emphasis = false,
}: {
  node: OrganigramNode
  selectedId: number | null
  emphasis?: boolean
}) {
  const search = useNodeHref(node.id)
  const isSelected = selectedId === node.id
  const isEmpty = node.holders.length === 0 && node.children.length === 0

  return (
    <Link
      to={{ search }}
      preventScrollReset
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'flex min-h-11 flex-col gap-0.5 rounded-md border-l-2 border-l-transparent px-2 py-1.5',
        'transition-colors hover:bg-accent/60',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'sm:flex-row sm:items-baseline sm:gap-4',
        isSelected && 'border-l-primary bg-accent',
      )}
    >
      <span
        className={cn(
          'text-sm sm:w-56 sm:shrink-0',
          isEmpty ? 'text-muted-foreground' : 'font-medium',
          emphasis && 'font-semibold',
        )}
      >
        {node.name}
        {/* Honest rather than alarming: without a leader/unit distinction the model cannot tell a
            post nobody holds from a group nobody has joined yet. */}
        {isEmpty && <span className="pl-2 text-muted-foreground text-xs">— personne</span>}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <Holders node={node} />
        {node.note && <span className="text-muted-foreground text-xs italic">{node.note}</span>}
      </span>
    </Link>
  )
}

export function OrganigramTree({ tree, selectedId = null }: { tree: OrganigramNode[]; selectedId?: number | null }) {
  const blocks = toLayout(tree)

  return (
    <div className="flex flex-col gap-5">
      {blocks.map(block => {
        if (block.kind === 'roster') {
          return (
            <section key={block.id} aria-labelledby={`roster-${block.id}`}>
              <h3 id={`roster-${block.id}`} className="flex items-center gap-2 pb-1">
                <Users aria-hidden="true" className="size-3.5 text-muted-foreground" />
                <span className="font-semibold text-xs uppercase tracking-wide">{block.title}</span>
                <Badge variant="outline">{block.node.holders.length}</Badge>
              </h3>
              <div className="px-2">
                <Holders node={block.node} />
              </div>
            </section>
          )
        }

        if (block.kind === 'row') {
          return <Row key={block.id} node={block.node} selectedId={selectedId} />
        }

        return (
          <section key={block.id} aria-labelledby={`band-${block.id}`}>
            {/* The header carries the nesting, so nothing below needs an indent. It names whose
                responsibility the band falls under, as the printed sheet does. */}
            {block.under && (
              <h3 id={`band-${block.id}`} className="border-b pb-1 text-muted-foreground text-xs italic tracking-wide">
                Sous la responsabilité de {block.under}
              </h3>
            )}
            <div className="flex flex-col pt-1">
              {/* The band's own node is a row, not just a heading — otherwise its holders vanish. */}
              <Row node={block.node} selectedId={selectedId} emphasis />
              <div className="flex flex-col border-border/60 border-l pl-2">
                {block.rows.map(row => (
                  <Row key={row.id} node={row} selectedId={selectedId} />
                ))}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
