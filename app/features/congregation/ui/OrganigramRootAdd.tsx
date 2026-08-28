import { Form } from 'react-router'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'

// Adding a service at the top of the chart.
//
// The page never says "rôle": that is the storage entity, not the congregation's word for what
// it is looking at. The sheet this replaces is called "Organisation des services".
//
// The node panel can only add *under* the node you selected, which leaves a congregation with an
// empty chart unable to start one: nothing to select, so no panel, so no way in. This is the way
// in — and afterwards it is still how a second root gets added.

interface Props {
  adoptable: { id: number; name: string }[]
  /** Prominent when the chart is empty, quiet once there is something to look at. */
  emphasis?: 'primary' | 'quiet'
}

export function OrganigramRootAdd({ adoptable, emphasis = 'quiet' }: Props) {
  if (adoptable.length === 0) {
    return <p className="text-muted-foreground text-sm">Tous les services sont déjà dans l’organigramme.</p>
  }

  return (
    <Form method="post" className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="parentRoleId" value="none" />

      <div className="flex-1 space-y-1">
        <Label htmlFor="root-add-role" className="text-muted-foreground text-xs">
          Ajouter un service au sommet de l’organigramme
        </Label>
        <select
          id="root-add-role"
          name="roleId"
          required
          className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {adoptable.map(role => (
            <option key={role.id} value={role.id}>
              {role.name}
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
