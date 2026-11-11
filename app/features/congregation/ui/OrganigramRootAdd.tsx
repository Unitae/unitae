import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

// Putting a list back at the top of the chart. Only the elders' and assistants' lists sit at the top — every role
// answers to them — and one is missing only when a congregation took it off, or restored an archive from before the
// organigram. A recovery path: in the normal case both lists are placed and this renders nothing.

export function OrganigramRootAdd({
  rosters,
  emphasis = 'quiet',
}: {
  /** The lists absent from the chart. */
  rosters: { id: number; name: string }[]
  /** Prominent on an empty chart, quiet once there is something to read. */
  emphasis?: 'primary' | 'quiet'
}) {
  const fetcher = useFetcher()
  if (rosters.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {rosters.map(roster => (
        <Button
          key={roster.id}
          type="button"
          size="sm"
          variant={emphasis === 'primary' ? 'default' : 'outline'}
          disabled={fetcher.state !== 'idle'}
          onClick={() =>
            fetcher.submit({ intent: 'add', roleId: String(roster.id), parentRoleId: 'none' }, { method: 'post' })
          }
        >
          {m.org_root_add({ name: roster.name })}
        </Button>
      ))}
    </div>
  )
}
