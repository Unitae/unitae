import { ArrowDown, ArrowUp } from 'lucide-react'
import { Form } from 'react-router'
import { PeopleSection } from '~/features/congregation/ui/OrganigramPeopleSection'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import type { PersonOption } from '~/shared/ui/PersonDropdown'
import { cn } from '~/shared/utils/utils'

// Everything that mutates the organigram lives here, scoped to one node.
//
// The chart never mutates: you select a node and act on it in one place, instead of
// re-identifying it in a dropdown that repeats the tree you were already looking at. This is
// rendered in a sidebar on desktop and a bottom sheet on mobile — same content, same markup.

export type { PanelHolder } from '~/features/congregation/ui/OrganigramPeopleSection'

export interface PanelNode {
  id: number
  name: string
  isRoster: boolean
  /** The committee and its posts: placed by provisioning, never moved or removed. */
  isFixed: boolean
  /** One of the three committee posts: one elder holds it, and seating replaces the incumbent. */
  isPost: boolean
  parentId: number | null
  parentName: string | null
  childCount: number
  holders: import('~/features/congregation/ui/OrganigramPeopleSection').PanelHolder[]
}

interface Props {
  node: PanelNode
  /** Everyone in the congregation; those without a login are disabled with a reason. */
  people: PersonOption[]
  peopleWithoutAccount: number[]
  /** Members who are not elders — refused on the three committee posts. */
  nonElderIds: number[]
  /** Roles that exist but are not yet in the chart. */
  adoptable: { id: number; name: string }[]
  /** Every node in the chart except this one and its descendants — legal parents. */
  moveTargets: { id: number; label: string }[]
}

const selectClass =
  'h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

/**
 * Sentence case, not uppercase tracking.
 *
 * Four shouty labels down a 22rem column read as four warnings competing with the node's own
 * name, which is the only thing in the panel that should carry weight. A rule above each section
 * separates them better than capitals do, and costs no emphasis.
 */
function Section({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  // Every section carries its own top spacing rather than the column carrying a gap, so the rule
  // sits at a consistent distance from the section above and below it.
  return <section className={cn('flex flex-col gap-2 pt-5', !first && 'border-t')}>{children}</section>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-medium text-sm">{children}</h3>
}

export function OrganigramNodePanel({
  node,
  people,
  peopleWithoutAccount,
  nonElderIds,
  adoptable,
  moveTargets,
}: Props) {
  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-1">
        <h2 className="font-semibold text-base">{node.name}</h2>
        <p className="text-muted-foreground text-xs">
          {node.parentName ? `Sous ${node.parentName}` : 'Au sommet de l’organigramme'}
          {node.childCount > 0 &&
            ` · ${node.childCount} service${node.childCount > 1 ? 's' : ''} rattaché${node.childCount > 1 ? 's' : ''}`}
        </p>
        {node.isRoster && (
          <Badge variant="outline" className="w-fit">
            Synchronisé depuis les fiches des proclamateurs
          </Badge>
        )}
      </header>

      <PeopleSection
        node={node}
        people={people}
        peopleWithoutAccount={peopleWithoutAccount}
        nonElderIds={nonElderIds}
      />

      {!node.isRoster && node.isFixed && (
        <Section>
          <SectionTitle>Place dans l’organigramme</SectionTitle>
          <p className="text-muted-foreground text-sm">
            Le comité de service et ses trois fonctions ont une place fixe : le comité sous le collège des anciens, les
            trois fonctions dans le comité.
          </p>
        </Section>
      )}

      {!node.isRoster && !node.isFixed && (
        <Section>
          <SectionTitle>Place dans l’organigramme</SectionTitle>

          <div className="flex gap-2">
            {(['up', 'down'] as const).map(direction => (
              <Form method="post" className="flex-1" key={direction}>
                <input type="hidden" name="intent" value="move" />
                <input type="hidden" name="roleId" value={node.id} />
                <input type="hidden" name="direction" value={direction} />
                <Button type="submit" variant="outline" className="w-full">
                  {direction === 'up' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                  {direction === 'up' ? 'Monter' : 'Descendre'}
                </Button>
              </Form>
            ))}
          </div>

          <Form method="post" className="flex flex-col gap-2">
            <input type="hidden" name="intent" value="set-parent" />
            <input type="hidden" name="roleId" value={node.id} />
            <Label htmlFor={`move-${node.id}`} className="text-muted-foreground text-xs">
              Déplacer sous
            </Label>
            {/* Descendants are absent from `moveTargets`, so a cycle cannot be chosen. Refusing a
                selection after a page reload is a worse way to teach the same rule. */}
            <select
              id={`move-${node.id}`}
              name="parentRoleId"
              className={selectClass}
              defaultValue={node.parentId == null ? 'none' : String(node.parentId)}
            >
              <option value="none">— Au sommet de l’organigramme —</option>
              {moveTargets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Déplacer
            </Button>
          </Form>
        </Section>
      )}

      <Section>
        <SectionTitle>Rattacher un service</SectionTitle>

        {/* Pick an existing service or name a new one, in one submit. Splitting these into two
            controls — or worse, sending the admin to the roles page to create one — is the
            two-page bounce that makes building a first chart tedious. */}
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="parentRoleId" value={node.id} />

          {adoptable.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-sm">
                <input type="radio" name="intent" value="add" defaultChecked className="size-4" />
                Un service existant
              </span>
              <select name="roleId" aria-label="Service à rattacher" className={selectClass}>
                {adoptable.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="intent"
                value="create"
                defaultChecked={adoptable.length === 0}
                className="size-4"
              />
              Un nouveau service
            </span>
            <input
              type="text"
              name="name"
              maxLength={100}
              placeholder="Nom du service"
              aria-label="Nom du nouveau service"
              className={selectClass}
            />
          </label>

          <Button type="submit" variant="outline">
            Rattacher à « {node.name} »
          </Button>
        </Form>
      </Section>

      {!node.isRoster && !node.isFixed && (
        <Form method="post" className="border-t pt-5">
          <input type="hidden" name="intent" value="remove" />
          <input type="hidden" name="roleId" value={node.id} />
          <Button type="submit" variant="ghost" className="w-full text-destructive hover:bg-destructive/10">
            Sortir de l’organigramme
          </Button>
          <p className="pt-1 text-muted-foreground text-xs">
            Le service et ses membres sont conservés.
            {node.childCount > 0 && ' Les services rattachés remontent d’un niveau.'}
          </p>
        </Form>
      )}
    </div>
  )
}
