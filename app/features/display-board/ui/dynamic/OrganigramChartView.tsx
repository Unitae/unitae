import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { bandEntries, groupLayout, seatLabel, serviceParts, toLayout } from '~/shared/domain/organigram-layout'
import { cn } from '~/shared/utils/utils'
import { BranchSection, formatName, Line, Roster, ServiceWithTeams } from './OrganigramView'

// The organigram on the board screen as a chart: the rosters, then the service committee's three
// posts side by side, each heading the column of the services it answers for, then whatever the
// elders keep for themselves. The same layout its printed sheet calls « Postes en colonnes ».

/** A service in a post's column: its name, then each of its people on a line. */
function ChartService({ node, rows }: { node: OrganigramNode; rows: OrganigramNode[] | null }) {
  const { holders, teams } = serviceParts(node, rows)
  return (
    <div className="border-border flex flex-col gap-0.5 border-b py-2 text-sm">
      <span className="font-bold">{node.name}</span>
      {holders.map(holder => {
        const label = seatLabel(holder, node)
        return (
          <span key={`${holder.memberId}-${holder.kind}`}>
            {label && <span className="board-accent">{label} </span>}
            {formatName(holder)}
          </span>
        )
      })}
      {teams.length > 0 && (
        <span className="text-muted-foreground">
          {teams.length === 1 ? 'Équipe ' : 'Équipes '}
          {teams.map(team => team.name).join(', ')}
        </span>
      )}
      {node.note && <span className="text-muted-foreground text-xs italic">{node.note}</span>}
    </div>
  )
}

export function OrganigramChartView({ tree }: { tree: OrganigramNode[] }) {
  if (tree.length === 0) {
    return <p className="text-muted-foreground px-4 py-6 text-sm md:px-6">L’organigramme est vide.</p>
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
        <section className="border-foreground flex flex-col gap-3 border-t pt-3">
          <h3 className="text-lg font-bold">{committee.node.name}</h3>
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-3">
            {committee.posts.map(post => {
              const titular = post.holders.find(holder => holder.kind === 'leader')
              const deputies = post.holders.filter(holder => holder.kind === 'deputy')
              const branch = sections.find(section => section.under === post.name)
              return (
                <div key={post.id} className="flex flex-col">
                  <div className="border-foreground flex flex-col gap-0.5 border-b pb-2">
                    <span className="board-accent text-sm">{post.name}</span>
                    <span className={cn('text-lg', !titular && 'text-muted-foreground')}>
                      {titular ? formatName(titular) : '—'}
                    </span>
                    {deputies.length > 0 && (
                      <span className="text-sm">
                        <span className="board-accent">Adjoint </span>
                        {deputies.map(deputy => formatName(deputy)).join(' · ')}
                      </span>
                    )}
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
  )
}
