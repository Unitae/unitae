import type { ReactNode } from 'react'
import * as m from '~/i18n/paraglide/messages'
import type { OrganigramHolder, OrganigramNode } from '~/shared/domain/organigram.queries'
import type { CommitteeBlock, RosterBlock } from '~/shared/domain/organigram-layout'
import {
  bandEntries,
  deputiesLabel,
  groupLayout,
  responsibilityEyebrow,
  seatLabel,
  serviceParts,
  teamsLabel,
  toLayout,
} from '~/shared/domain/organigram-layout'
import { BoardPersonName } from './BoardPersonName'
import { DocLink, useBoardReading } from './board-reading'

// The organigram on the board screen, laid out as its printed sheet (« Par responsable »): the
// two rosters, the service committee under a rule, then each post's services as rows, the
// service on the left and who to ask for on the right. Labels take the document's accent; names
// read « Prénom NOM ». The chart layout reuses these pieces.

/** A role's name, opening it in the organigram for a reader whose rights open that page. */
export function RoleName({ node, className }: { node: Pick<OrganigramNode, 'id' | 'name'>; className?: string }) {
  const { reader } = useBoardReading()
  if (!reader?.canViewRoles) return <span className={className}>{node.name}</span>
  return (
    <DocLink
      to={`/congregation/roles/organigram?role=${node.id}`}
      title={m.board_viewer_open_role()}
      className={className}
    >
      {node.name}
    </DocLink>
  )
}

function Person({ holder }: { holder: OrganigramHolder }) {
  return <BoardPersonName person={holder} memberId={holder.memberId} />
}

/** Names one after the other, a comma between: the comma stays with the name before it. */
function Names({ holders }: { holders: OrganigramHolder[] }) {
  return holders.map((holder, index) => (
    <span key={`${holder.memberId}-${holder.kind}`}>
      <Person holder={holder} />
      {index < holders.length - 1 && ', '}
    </span>
  ))
}

/** One labelled group of people on a service line: « Responsable Marc DUPONT », « Adjoints A, B ». */
function Seat({ label, holders, last }: { label: string | null; holders: OrganigramHolder[]; last: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {label && <span className="board-accent mr-1.5 text-sm">{label}</span>}
      <Names holders={holders} />
      {!last && (
        <span aria-hidden="true" className="px-2 text-muted-foreground">
          ·
        </span>
      )}
    </span>
  )
}

/**
 * A service's seats, labelled: each leader with their title, then its adjoints together. Adjoints
 * go unlabelled where the role's own name already says « Adjoint », as on the sheet (`seatLabel`).
 */
function Seats({ node, holders }: { node: OrganigramNode; holders: OrganigramHolder[] }) {
  const leaders = holders.filter(holder => holder.kind !== 'deputy')
  const deputies = holders.filter(holder => holder.kind === 'deputy')
  const deputyLabel =
    deputies.length > 0 && seatLabel(deputies[0], node) != null ? deputiesLabel(deputies.length) : null
  const seats: { label: string | null; holders: OrganigramHolder[] }[] = [
    ...leaders.map(leader => ({ label: seatLabel(leader, node), holders: [leader] })),
    ...(deputies.length > 0 ? [{ label: deputyLabel, holders: deputies }] : []),
  ]
  if (seats.length === 0) return null
  return (
    <span className="flex flex-wrap items-baseline gap-y-0.5">
      {seats.map((seat, index) => (
        <Seat key={`${seat.label}-${seat.holders[0].memberId}`} {...seat} last={index === seats.length - 1} />
      ))}
    </span>
  )
}

/** A service as one row: its name on the left; its seats, then its teams, on the right. */
export function ServiceRow({ node, rows }: { node: OrganigramNode; rows: OrganigramNode[] | null }) {
  const { holders, teams } = serviceParts(node, rows)
  return (
    <div className="grid items-baseline gap-x-6 gap-y-0.5 border-border border-b py-2 sm:grid-cols-[15rem_minmax(0,1fr)]">
      <RoleName node={node} className="font-semibold" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Seats node={node} holders={holders} />
        {teams.length > 0 && (
          <span className="text-muted-foreground text-sm">
            {teamsLabel(teams.length)} {teams.map(team => team.name).join(', ')}
          </span>
        )}
        {node.note && <span className="text-muted-foreground text-sm italic">{node.note}</span>}
      </div>
    </div>
  )
}

/** A roster (the elders, the ministerial servants): its count, then every name in columns. */
export function Roster({ block }: { block: RosterBlock }) {
  return (
    <section className="flex flex-col gap-2 border-foreground border-t-[1.5px] pt-2">
      <h2 className="flex items-baseline justify-between gap-3 font-bold text-lg">
        {block.title}
        <span className="font-normal text-muted-foreground text-sm tabular-nums">{block.node.holders.length}</span>
      </h2>
      <ul className="columns-2 gap-x-6">
        {block.node.holders.map(holder => (
          <li key={holder.memberId} className="break-inside-avoid">
            <Person holder={holder} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A committee post's head: the function in the accent, its titulaire, its adjoints. */
export function PostHead({ post, large = false }: { post: OrganigramNode; large?: boolean }) {
  const titular = post.holders.find(holder => holder.kind === 'leader')
  const deputies = post.holders.filter(holder => holder.kind === 'deputy')
  return (
    <div className="flex flex-col gap-0.5">
      <RoleName node={post} className="board-accent text-sm" />
      <span className={large ? 'text-lg' : undefined}>
        {titular ? <Person holder={titular} /> : <span className="text-muted-foreground">—</span>}
      </span>
      {deputies.length > 0 && (
        <span className="text-sm">
          <span className="board-accent mr-1.5">{deputiesLabel(deputies.length)}</span>
          <Names holders={deputies} />
        </span>
      )}
    </div>
  )
}

/** The service committee under a rule: its three posts side by side. */
function Committee({ block }: { block: CommitteeBlock }) {
  return (
    <section className="flex flex-col gap-3 border-foreground border-t-[1.5px] pt-2">
      <h2 className="font-bold text-lg">{block.node.name}</h2>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
        {block.posts.map(post => (
          <PostHead key={post.id} post={post} />
        ))}
      </div>
    </section>
  )
}

/** One post's branch: « Sous la responsabilité du », the post, then its services as rows. */
export function BranchSection({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      {heading}
      {children}
    </section>
  )
}

export function BranchHeading({ under, post }: { under: string; post: OrganigramNode | undefined }) {
  return (
    <header className="mb-1 flex flex-col border-foreground border-b-[1.5px] pb-1.5">
      <span className="text-muted-foreground text-sm">{responsibilityEyebrow(under)}</span>
      <h2 className="font-bold text-xl leading-snug">{post ? <RoleName node={post} /> : under}</h2>
    </header>
  )
}

export function OrganigramView({ tree }: { tree: OrganigramNode[] }) {
  if (tree.length === 0) {
    return <p className="px-4 py-6 text-muted-foreground text-sm md:px-6">{m.board_organigram_empty()}</p>
  }

  const { rosters, committee, sections, legacy } = groupLayout(toLayout(tree))
  const postByName = new Map(committee?.posts.map(post => [post.name, post]) ?? [])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-6 pb-12 md:px-6 md:pt-8">
      {rosters.length > 0 && (
        <div className="grid gap-8 sm:grid-cols-2">
          {rosters.map(roster => (
            <Roster key={roster.id} block={roster} />
          ))}
        </div>
      )}

      {committee && <Committee block={committee} />}

      {sections.map(section => (
        <BranchSection
          key={section.under + String(section.bands[0]?.id ?? '')}
          heading={<BranchHeading under={section.under} post={postByName.get(section.under)} />}
        >
          {bandEntries(section.bands).map(({ node, rows }) => (
            <ServiceRow key={node.id} node={node} rows={rows} />
          ))}
        </BranchSection>
      ))}

      {legacy.length > 0 && (
        <section className="flex flex-col border-border border-t pt-2">
          {legacy.map(block =>
            block.kind === 'row' ? (
              <ServiceRow key={block.id} node={block.node} rows={null} />
            ) : (
              bandEntries([block]).map(({ node, rows }) => <ServiceRow key={node.id} node={node} rows={rows} />)
            ),
          )}
        </section>
      )}
    </div>
  )
}
