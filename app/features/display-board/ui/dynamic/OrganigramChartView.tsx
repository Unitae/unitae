import * as m from '~/i18n/paraglide/messages'
import type { OrganigramHolder, OrganigramNode } from '~/shared/domain/organigram.queries'
import {
  bandEntries,
  groupLayout,
  seatLabel,
  serviceParts,
  teamsLabel,
  toLayout,
} from '~/shared/domain/organigram-layout'
import { BoardPersonName } from './BoardPersonName'
import { BranchHeading, BranchSection, PostHead, RoleName, Roster, ServiceRow } from './OrganigramView'

// The organigram on the board screen as a chart: the rosters, then the service committee's three
// posts side by side, each heading the column of the services it answers for, then whatever the
// elders keep for themselves. The same layout its printed sheet calls « Postes en colonnes ».

function Holder({ holder, node }: { holder: OrganigramHolder; node: OrganigramNode }) {
  const label = seatLabel(holder, node)
  return (
    <span>
      {label && <span className="board-accent mr-1.5">{label}</span>}
      <BoardPersonName person={holder} memberId={holder.memberId} />
    </span>
  )
}

/** A service in a post's column: its name, then each of its people on a line. */
function ChartService({ node, rows }: { node: OrganigramNode; rows: OrganigramNode[] | null }) {
  const { holders, teams } = serviceParts(node, rows)
  return (
    <div className="flex flex-col gap-0.5 border-border border-b py-2 text-sm">
      <RoleName node={node} className="font-bold" />
      {holders.map(holder => (
        <Holder key={`${holder.memberId}-${holder.kind}`} holder={holder} node={node} />
      ))}
      {teams.length > 0 && (
        <span className="text-muted-foreground">
          {teamsLabel(teams.length)} {teams.map(team => team.name).join(', ')}
        </span>
      )}
      {node.note && <span className="text-muted-foreground text-xs italic">{node.note}</span>}
    </div>
  )
}

export function OrganigramChartView({ tree }: { tree: OrganigramNode[] }) {
  if (tree.length === 0) {
    return <p className="px-4 py-6 text-muted-foreground text-sm md:px-6">{m.board_organigram_empty()}</p>
  }

  const { rosters, committee, sections, legacy } = groupLayout(toLayout(tree))
  const postNames = new Set(committee?.posts.map(post => post.name) ?? [])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-6 pb-12 md:px-6 md:pt-8">
      {rosters.length > 0 && (
        <div className="grid gap-8 sm:grid-cols-2">
          {rosters.map(roster => (
            <Roster key={roster.id} block={roster} />
          ))}
        </div>
      )}

      {committee && (
        <section className="flex flex-col gap-3 border-foreground border-t-[1.5px] pt-2">
          <h2 className="font-bold text-lg">{committee.node.name}</h2>
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-3">
            {committee.posts.map(post => {
              const branch = sections.find(section => section.under === post.name)
              return (
                <div key={post.id} className="flex flex-col">
                  <div className="border-foreground border-b pb-2">
                    <PostHead post={post} large />
                  </div>
                  {branch &&
                    bandEntries(branch.bands).map(({ node, rows }) => (
                      <ChartService key={node.id} node={node} rows={rows} />
                    ))}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {sections
        .filter(section => !postNames.has(section.under))
        .map(section => (
          <BranchSection
            key={section.under + String(section.bands[0]?.id ?? '')}
            heading={<BranchHeading under={section.under} post={undefined} />}
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
