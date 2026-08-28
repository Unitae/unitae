import * as m from '~/i18n/paraglide/messages'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { cn } from '~/shared/utils/utils'

// The board's rendering of the organigram. Deliberately its own component rather than the one
// on /congregation/roles/organigram: that one carries selection links into the editor, which
// mean nothing to a reader who cannot open it.
//
// This is the document a congregation prints and pins up, so it gets a print stylesheet and
// keeps the whole structure visible — no collapsing, no interaction.

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

function Node({ node, depth }: { node: OrganigramNode; depth: number }) {
  return (
    <li className={cn('border-border/70 border-l pl-3 sm:pl-4', depth === 0 && 'border-l-0 pl-0')}>
      <div className="flex flex-col gap-0.5 py-1.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={cn('text-sm', node.isRoster ? 'font-semibold text-xs uppercase tracking-wide' : 'font-medium')}
          >
            {node.name}
          </span>
          {node.isRoster && <span className="text-muted-foreground text-xs">({node.holders.length})</span>}
        </div>

        {node.holders.length > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-1 text-muted-foreground text-sm">
            {node.holders.map((holder, index) => {
              const label = seatLabel(holder.kind, node.name)
              return (
                <span key={`${holder.memberId}-${holder.kind}`} className="whitespace-nowrap">
                  {index > 0 && <span className="pr-1 text-muted-foreground/40">·</span>}
                  {label && <span className="text-[0.7rem] uppercase tracking-wide opacity-70">{label} </span>}
                  <span className="text-foreground/80">{formatName(holder)}</span>
                </span>
              )
            })}
          </p>
        )}

        {node.note && <p className="text-muted-foreground text-xs italic">{node.note}</p>}
      </div>

      {node.children.length > 0 && (
        <ul className="flex flex-col">
          {node.children.map(child => (
            <Node key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function OrganigramView({ tree }: { tree: OrganigramNode[] }) {
  if (tree.length === 0) {
    return <p className="px-4 py-6 text-muted-foreground text-sm md:px-6">L’organigramme est vide.</p>
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 md:px-6 print:max-w-none print:px-0">
      {/* This sheet is printed and pinned up, so drop the screen chrome and let it flow. */}
      <style>{`@media print{
        a[href]:after{content:none !important}
        .organigram-print{font-size:11pt;line-height:1.35}
      }`}</style>
      <ul className="organigram-print flex flex-col">
        {tree.map(node => (
          <Node key={node.id} node={node} depth={0} />
        ))}
      </ul>
    </div>
  )
}
