import * as m from '~/i18n/paraglide/messages'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { toLayout } from '~/shared/domain/organigram-layout'
import { cn } from '~/shared/utils/utils'

// The board's rendering of the organigram — a document, not a tool.
//
// Laid out in bands, the way the printed « Organisation des services » sheet does: a header names
// whose responsibility a group falls under, its services are rows beneath, and depth costs no
// horizontal space. That is what makes the paper version scannable on one page, and it is why
// this reads differently from the editing view, where nesting has to stay visible because you
// are rearranging it.

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

function People({ node }: { node: OrganigramNode }) {
  if (node.holders.length === 0) return null
  return (
    <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
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
            {formatName(holder)}
          </span>
        )
      })}
    </span>
  )
}

/** Two columns: the service on the left, its people on the right, as the sheet prints them. */
function Line({ node, strong = false }: { node: OrganigramNode; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-baseline sm:gap-4">
      <span className={cn('text-sm sm:w-56 sm:shrink-0', strong ? 'font-semibold' : 'font-medium')}>{node.name}</span>
      <span className="flex min-w-0 flex-col gap-0.5 text-muted-foreground text-sm">
        <People node={node} />
        {node.note && <span className="text-xs italic">{node.note}</span>}
      </span>
    </div>
  )
}

export function OrganigramView({ tree }: { tree: OrganigramNode[] }) {
  if (tree.length === 0) {
    return <p className="px-4 py-6 text-muted-foreground text-sm md:px-6">L’organigramme est vide.</p>
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 md:px-6 print:max-w-none print:px-0">
      {/* Pinned up on a noticeboard as often as it is read on a phone. */}
      <style>{`@media print{
        a[href]:after{content:none !important}
        .organigram-sheet{font-size:11pt;line-height:1.35}
        .organigram-sheet section{break-inside:avoid}
      }`}</style>

      <div className="organigram-sheet flex flex-col gap-5">
        {toLayout(tree).map(block => {
          if (block.kind === 'roster') {
            return (
              <section key={block.id}>
                <h3 className="flex items-baseline gap-2 pb-1">
                  <span className="font-semibold text-xs uppercase tracking-wide">{block.title}</span>
                  <span className="text-muted-foreground text-xs">({block.node.holders.length})</span>
                </h3>
                <p className="text-muted-foreground text-sm">
                  <People node={block.node} />
                </p>
              </section>
            )
          }

          if (block.kind === 'row') return <Line key={block.id} node={block.node} />

          return (
            <section key={block.id}>
              {block.under && (
                <h3 className="border-b pb-1 text-muted-foreground text-xs italic tracking-wide">
                  Sous la responsabilité de {block.under}
                </h3>
              )}
              {/* The band's own node is a line, not just a heading — otherwise its people vanish. */}
              <Line node={block.node} strong />
              <div className="border-border/60 border-l pl-3">
                {block.rows.map(row => (
                  <Line key={row.id} node={row} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
