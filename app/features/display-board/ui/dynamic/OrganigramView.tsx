import * as m from '~/i18n/paraglide/messages'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import type { BandBlock, CommitteeBlock, RosterBlock } from '~/shared/domain/organigram-layout'
import {
  bandAdjoints,
  groupLayout,
  responsibilityEyebrow,
  seatLabel,
  teamRows,
  toLayout,
} from '~/shared/domain/organigram-layout'
import { cn } from '~/shared/utils/utils'

// The board's rendering of the organigram — a document, not a tool.
//
// It reads like the « Organisation des services » sheet it replaces: the two rosters as the
// masthead, the committee as a bench of three nameplates — the page's one framed element,
// because the committee IS its three posts — then each post's branch as a titled section.
// Depth costs a header, never margin, which is what keeps an A4 page scannable and a 390px
// screen readable. The display face and the teal accent are the app's own; the sheet's only
// indulgence is the bench.

interface Holder {
  memberId: number
  firstname: string | null
  lastname: string | null
  anonymizedAt: Date | null
  kind: string
  isElder: boolean
}

function formatName(person: Holder): string {
  if (person.anonymizedAt != null) return m.board_read_status_anonymized_user()
  const lastname = person.lastname?.toLocaleUpperCase() ?? null
  return [person.firstname, lastname].filter(Boolean).join(' ') || '—'
}

function People({ node, membersHidden = false }: { node: OrganigramNode; membersHidden?: boolean }) {
  // The document names who to *ask for* — the responsable, the préposé, the adjoint. A full
  // team roll call turns a one-page sheet into a directory, so plain members simply do not
  // print. The rosters never pass this flag: they ARE the list.
  const shown = membersHidden
    ? node.holders.filter(holder => holder.kind === 'leader' || holder.kind === 'deputy')
    : node.holders
  if (shown.length === 0) return null
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      {shown.map((holder, index) => {
        const label = seatLabel(holder, node)
        return (
          <span key={`${holder.memberId}-${holder.kind}`} className="whitespace-nowrap">
            {index > 0 && (
              <span aria-hidden="true" className="pr-1.5 text-muted-foreground/40">
                ·
              </span>
            )}
            {label && <span className="text-[0.7rem] text-primary uppercase tracking-wide">{label} </span>}
            <span className="text-foreground/85">{formatName(holder)}</span>
          </span>
        )
      })}
    </span>
  )
}

/** Two columns: the service on the left, its people on the right, as the sheet prints them. */
function Line({ node }: { node: OrganigramNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-6">
      <span className="text-foreground/90 text-sm sm:w-56 sm:shrink-0">{node.name}</span>
      <span className="flex min-w-0 flex-col gap-0.5 text-sm">
        <People node={node} membersHidden />
        {node.note && <span className="text-muted-foreground text-xs italic">{node.note}</span>}
      </span>
    </div>
  )
}

const dot = (
  <span aria-hidden="true" className="px-1.5 text-muted-foreground/40">
    ·
  </span>
)

/**
 * A service and its teams as one line: « Audio/Vidéo — RESPONSABLE Philippe MARTIN · ADJOINTS
 * Sébastien ROUX, Jérôme MULLER · ÉQUIPES Perches, Estrade, Sono ».
 *
 * The leaders of everything beneath fold into the service's adjoints — that is what they are to
 * the person reading the sheet: who helps the responsable run this. Group roles then become
 * names on the ÉQUIPES line, because who to ask for matters on a noticeboard; the full roster
 * never did. A nested personal role is not a team and is not named there — it is already on the
 * line above, as an adjoint.
 */
function ServiceWithTeams({ node, rows }: { node: OrganigramNode; rows: OrganigramNode[] }) {
  // Only group roles are teams; the personal roles among `rows` are adjoint arrangements and
  // reach the reader through the ADJOINTS segment instead. Both halves of that rule live in
  // organigram-layout so this view and the PDF cannot drift apart on it.
  const teams = teamRows(rows)
  const leaders = node.holders.filter(holder => holder.kind === 'leader')
  const deputies = bandAdjoints(node, rows)

  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-6">
      {/* Same weight as every other service: bold was the old container-heading style, and once
          the teams became a text line it read as arbitrary emphasis. ÉQUIPES says "has teams". */}
      <span className="text-foreground/90 text-sm sm:w-56 sm:shrink-0">{node.name}</span>
      <span className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {leaders.map((leader, index) => {
            const label = seatLabel(leader, node)
            return (
              <span key={leader.memberId} className="whitespace-nowrap">
                {index > 0 && dot}
                {label && <span className="text-[0.7rem] text-primary uppercase tracking-wide">{label} </span>}
                <span className="text-foreground/85">{formatName(leader)}</span>
              </span>
            )
          })}
          {deputies.length > 0 && (
            // No dot before a labelled segment: the small-caps label separates it, and a dot
            // dragged to the front of a wrapped line reads as a smudge.
            <span className="whitespace-nowrap">
              <span className="text-[0.7rem] text-primary uppercase tracking-wide">
                {deputies.length === 1 ? 'Adjoint' : 'Adjoints'}{' '}
              </span>
              <span className="text-foreground/85">{deputies.map(deputy => formatName(deputy)).join(', ')}</span>
            </span>
          )}
        </span>
        {/* Always its own line: people above, structure below — the eye finds each faster
            than in one run-on sentence. */}
        {teams.length > 0 && (
          <span>
            <span className="text-[0.7rem] text-muted-foreground uppercase tracking-wide">
              {teams.length === 1 ? 'Équipe' : 'Équipes'}{' '}
            </span>
            <span className="text-muted-foreground">{teams.map(team => team.name).join(', ')}</span>
          </span>
        )}
        {node.note && <span className="text-muted-foreground text-xs italic">{node.note}</span>}
      </span>
    </div>
  )
}

function Roster({ block }: { block: RosterBlock }) {
  return (
    <section className="border-foreground/30 border-t-2 pt-2">
      <h3 className="flex items-baseline gap-2 pb-1.5">
        <span className="font-semibold text-[0.7rem] uppercase tracking-[0.14em]">{block.title}</span>
        <span className="text-muted-foreground text-xs tabular-nums">({block.node.holders.length})</span>
      </h3>
      <p className="text-sm leading-relaxed">
        <People node={block.node} />
      </p>
    </section>
  )
}

/**
 * The committee bench: three nameplates in one frame — the sheet's single framed element,
 * because composition deserves to look like composition. Never a « sous la responsabilité »
 * header: the coordinator is not under the committee, he is part of it.
 */
function CommitteeBench({ block }: { block: CommitteeBlock }) {
  return (
    <section className="overflow-hidden rounded-lg border border-t-2 border-t-primary/60">
      <h3 className="border-b bg-muted/30 px-4 py-2 font-display font-semibold text-base">{block.node.name}</h3>
      <div className="grid sm:grid-cols-3">
        {block.posts.map((post, index) => {
          const titular = post.holders.find(holder => holder.kind === 'leader')
          const deputies = post.holders.filter(holder => holder.kind === 'deputy')
          return (
            <div
              key={post.id}
              className={cn('flex flex-col gap-1 px-4 py-3', index > 0 && 'border-t sm:border-t-0 sm:border-l')}
            >
              {/* Two lines are reserved even for one-line functions, so the three names sit on a
                  shared baseline when « Coordinateur du collège des anciens » wraps. */}
              <span className="min-h-8 text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
                {post.name}
              </span>
              <span className={cn('font-display text-base', !titular && 'text-muted-foreground')}>
                {titular ? formatName(titular) : '—'}
              </span>
              {deputies.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  <span className="text-[0.7rem] text-primary uppercase tracking-wide">Adjoint </span>
                  {deputies.map(deputy => formatName(deputy)).join(' · ')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** One responsibility branch: an eyebrow, the name in the display face, then its bands. */
function BranchSection({ under, bands }: { under: string; bands: BandBlock[] }) {
  return (
    <section className="flex flex-col gap-2">
      <header className="border-b pb-2">
        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
          {responsibilityEyebrow(under)}
        </p>
        <h3 className="font-display font-medium text-lg leading-snug">{under}</h3>
      </header>
      <div className="flex flex-col gap-1">
        {bands.map(band =>
          band.node ? (
            <ServiceWithTeams key={band.id} node={band.node} rows={band.rows} />
          ) : (
            band.rows.map(row => <Line key={row.id} node={row} />)
          ),
        )}
      </div>
    </section>
  )
}

export function OrganigramView({ tree }: { tree: OrganigramNode[] }) {
  if (tree.length === 0) {
    return <p className="px-4 py-6 text-muted-foreground text-sm md:px-6">L’organigramme est vide.</p>
  }

  const { rosters, committee, sections, legacy } = groupLayout(toLayout(tree))

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12 md:px-6 md:pt-8 print:max-w-none print:px-0 print:pt-0">
      {/* Pinned up on a noticeboard as often as it is read on a phone. */}
      <style>{`@media print{
        a[href]:after{content:none !important}
        .organigram-sheet{font-size:11pt;line-height:1.35;gap:1.25rem}
        .organigram-sheet section{break-inside:avoid}
      }`}</style>

      <div className="organigram-sheet flex flex-col gap-8">
        {rosters.length > 0 && (
          <div className="grid gap-8 sm:grid-cols-2">
            {rosters.map(roster => (
              <Roster key={roster.id} block={roster} />
            ))}
          </div>
        )}

        {committee && <CommitteeBench block={committee} />}

        {sections.map(section => (
          <BranchSection key={section.under + String(section.bands[0]?.id ?? '')} {...section} />
        ))}

        {legacy.length > 0 && (
          <section className="flex flex-col gap-3 border-t pt-4">
            {legacy.map(block => {
              if (block.kind === 'row') return <Line key={block.id} node={block.node} />
              if (block.node) return <ServiceWithTeams key={block.id} node={block.node} rows={block.rows} />
              return block.rows.map(row => <Line key={row.id} node={row} />)
            })}
          </section>
        )}
      </div>
    </div>
  )
}
