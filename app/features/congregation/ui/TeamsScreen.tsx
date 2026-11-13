import { ChevronDown, CircleAlert, CircleCheck, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { MatrixGroup, MatrixMember } from '~/features/congregation/model/role-matrix.type'
import type { BuiltInFilterKey } from '~/features/congregation/schemas/role.schema'
import { OrgHeading } from '~/features/congregation/ui/OrgHeading'
import { RolesTabs } from '~/features/congregation/ui/RolesTabs'
import type { TeamToggleResult } from '~/features/congregation/ui/TeamCell'
import { TeamsPhone } from '~/features/congregation/ui/TeamsPhone'
import { TeamsTable } from '~/features/congregation/ui/TeamsTable'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { SearchInput } from '~/shared/ui/SearchInput'
import { cn } from '~/shared/utils/utils'

// Équipes: who is in which team. A tick saves at once and says so in one quiet line — no toast for a gesture made
// twenty times in a row. Responsables and adjoints are named on the organigram; their letter leads there.

const MAIN_VIEWS: [BuiltInFilterKey, () => string][] = [
  ['all', m.teams_view_all],
  ['male', m.teams_view_brothers],
  ['female', m.teams_view_sisters],
  ['elder', m.teams_view_elders],
  ['assistant-servant', m.teams_view_servants],
]
const MORE_VIEWS: [BuiltInFilterKey, () => string][] = [
  ['publisher', m.teams_view_publishers],
  ['baptized', m.teams_view_baptized],
  ['anointed', m.teams_view_anointed],
]

const chip =
  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none transition-colors duration-(--u-duration-fast) focus-visible:ring-2 focus-visible:ring-ring'
const chipState = (on: boolean) =>
  on ? 'border-foreground text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'

function Views({ view, counts }: { view: BuiltInFilterKey; counts: Record<BuiltInFilterKey, number> }) {
  const [, setParams] = useSearchParams()
  const pick = (next: string) =>
    setParams(
      previous => {
        if (next === 'all') previous.delete('view')
        else previous.set('view', next)
        previous.delete('builtIn')
        return previous
      },
      { replace: true, preventScrollReset: true },
    )
  const more = MORE_VIEWS.find(([key]) => key === view)

  return (
    <fieldset aria-label={m.teams_views()} className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
      {MAIN_VIEWS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={view === key}
          onClick={() => pick(key)}
          className={cn(chip, chipState(view === key))}
        >
          {label()}
          <span className="text-faint font-normal tabular-nums">{counts[key]}</span>
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-pressed={more != null} className={cn(chip, chipState(more != null))}>
            {more ? more[1]() : m.teams_view_more()}
            {more && <span className="text-faint font-normal tabular-nums">{counts[more[0]]}</span>}
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={view} onValueChange={pick}>
            {MORE_VIEWS.map(([key, label]) => (
              <DropdownMenuRadioItem key={key} value={key}>
                <span className="flex-1">{label()}</span>
                <span className="text-faint tabular-nums">{counts[key]}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </fieldset>
  )
}

function savedLine(result: TeamToggleResult): string {
  if (!result.ok) return m.teams_refused({ error: result.error })
  return result.intent === 'add'
    ? m.teams_saved_in({ person: result.person, role: result.role })
    : m.teams_saved_out({ person: result.person, role: result.role })
}

export function TeamsScreen({
  groups,
  members,
  counts,
  views,
  view,
  canManage,
}: {
  groups: MatrixGroup[]
  members: MatrixMember[]
  counts: Record<number, number>
  views: Record<BuiltInFilterKey, number>
  view: BuiltInFilterKey
  canManage: boolean
}) {
  const [last, setLast] = useState<TeamToggleResult | null>(null)
  const body = { groups, members, counts, canManage, onResult: setLast }

  return (
    <div className="flex flex-col gap-5">
      <PageTopbar
        trail={[{ label: m.org_title(), to: '/congregation/roles/organigram' }, { label: m.org_tab_teams() }]}
        className="mb-0"
        actions={
          canManage && (
            <Button asChild size="sm" className="max-md:hidden">
              <Link to="/congregation/roles/organigram?new=1">
                <Plus aria-hidden="true" />
                {m.org_new_role()}
              </Link>
            </Button>
          )
        }
      >
        <OrgHeading canCreate={canManage} newRole={{ to: '/congregation/roles/organigram?new=1' }} />
      </PageTopbar>

      <RolesTabs />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="w-full sm:w-60">
          <SearchInput placeholder={m.teams_search()} />
        </div>
        <Views view={view} counts={views} />
        <span className="flex-1" />
        <p
          role="status"
          className={cn('flex items-center gap-1.5 text-sm', last?.ok === false ? 'text-destructive' : 'text-faint')}
        >
          {last &&
            (last.ok ? (
              <CircleCheck aria-hidden="true" className="text-success size-3.5" />
            ) : (
              <CircleAlert aria-hidden="true" className="size-3.5" />
            ))}
          {last && savedLine(last)}
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {m.teams_empty()}
        </p>
      ) : (
        // Both are rendered and CSS shows one, so neither a phone nor a desktop sees the other first.
        <>
          <div className="max-md:hidden">
            <TeamsTable {...body} />
          </div>
          <div className="md:hidden">
            <TeamsPhone {...body} />
          </div>
        </>
      )}

      {canManage && groups.length > 0 && <p className="text-faint text-xs">{m.teams_hint()}</p>}
    </div>
  )
}
