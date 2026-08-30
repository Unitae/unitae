import { Form } from 'react-router'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'

// Putting a roster back at the top of the chart.
//
// Services are never roots — everything answers to the collège des anciens — so the old
// "add a service at the top" form is gone. What can legitimately sit at the top are the two
// auto-synced rosters, and the only way one is missing is a congregation that took its list
// off the sheet, or an archive from before the organigram existed. This is the recovery path;
// in the normal case both rosters are placed and this renders nothing at all.

interface Props {
  /** The identity rosters currently absent from the chart. */
  rosters: { id: number; name: string }[]
  /** Prominent when the chart is empty, quiet once there is something to look at. */
  emphasis?: 'primary' | 'quiet'
}

export function OrganigramRootAdd({ rosters, emphasis = 'quiet' }: Props) {
  if (rosters.length === 0) return null

  return (
    <Form method="post" className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="parentRoleId" value="none" />

      <div className="flex-1 space-y-1">
        <Label htmlFor="root-add-role" className="text-muted-foreground text-xs">
          Remettre une liste au sommet de l’organigramme
        </Label>
        <select
          id="root-add-role"
          name="roleId"
          required
          className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {rosters.map(roster => (
            <option key={roster.id} value={roster.id}>
              {roster.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" variant={emphasis === 'primary' ? 'default' : 'outline'}>
        Ajouter
      </Button>
    </Form>
  )
}
