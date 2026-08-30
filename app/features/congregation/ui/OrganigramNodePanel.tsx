import { ArrowDown, ArrowUp } from 'lucide-react'
import { Form, Link } from 'react-router'
import { PeopleSection } from '~/features/congregation/ui/OrganigramPeopleSection'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import type { PersonOption } from '~/shared/ui/PersonDropdown'

// Everything that mutates the organigram lives here, scoped to one node.
//
// The chart never mutates: you select a node and act on it in one place, instead of
// re-identifying it in a dropdown that repeats the tree you were already looking at. This is
// rendered in a sidebar on desktop and a bottom sheet on mobile — same content, same markup.
//
// The panel is deliberately two-tier. Seating people is what an admin does every time they
// open it, so « Personnes » stands alone; moving, attaching and removing are occasional, so
// they fold into one collapsed « Organiser » block. Showing all four workflows at equal weight
// is what made the panel read as complicated — a wall of fields where a mistake felt easy.

export type { PanelHolder } from '~/features/congregation/ui/OrganigramPeopleSection'

export interface PanelNode {
  id: number
  name: string
  isRoster: boolean
  /** The committee and its posts: placed by provisioning, never moved or removed. */
  isFixed: boolean
  /** One of the three committee posts: one elder holds it, and seating replaces the incumbent. */
  isPost: boolean
  /** The committee itself, whose membership is derived from its three posts rather than typed. */
  isCommittee: boolean
  /** A personal role: one titular `leader` seat with a handover, adjoints allowed, no members. */
  isSinglePerson: boolean
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
  'h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50'

/**
 * The one deliberate emphasis move in the panel: sections inside « Organiser » are anchored by
 * a small uppercase eyebrow with a left accent — echoing the tree's left-border nesting —
 * instead of a stack of identical bordered headings. « Personnes » keeps its sentence-case
 * title: it is the panel's primary content, not one option among four.
 */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-l-2 border-l-primary/50 pl-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
      {children}
    </h3>
  )
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
        {/* The node's name lives in the aside's own header bar, which never scrolls away. */}
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
        {node.isSinglePerson && !node.isRoster && (
          <Badge variant="outline" className="w-fit">
            Rôle personnel
          </Badge>
        )}
        {/* Name, description and the personal-role type are the role's own definition, edited on
            its page — the chart only arranges roles and seats people. Built-ins have no such
            page: their names are localised and their shape is structure. */}
        {!node.isRoster && !node.isFixed && (
          <Link
            to={`/congregation/roles/${node.id}/edit`}
            className="w-fit text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
          >
            Modifier le rôle — nom, description, type
          </Link>
        )}
      </header>

      {/* Keyed so the seat form's local state (chosen kind) resets when another node is selected. */}
      <PeopleSection
        key={node.id}
        node={node}
        people={people}
        peopleWithoutAccount={peopleWithoutAccount}
        nonElderIds={nonElderIds}
      />

      {/* Collapsed by default: these are done a handful of times while building the chart, then
          rarely again — and every action inside is reversible, which the copy says in place. */}
      <details className="mt-5 border-t pt-4">
        <summary className="cursor-pointer font-medium text-sm">Organiser l’arborescence</summary>

        <div className="flex flex-col gap-6 pt-4">
          {node.isFixed && !node.isRoster && (
            <p className="text-muted-foreground text-sm">
              Le comité de service et ses trois fonctions ont une place fixe : le comité sous le collège des anciens,
              les trois fonctions dans le comité.
            </p>
          )}

          {!node.isRoster && !node.isFixed && (
            <section className="flex flex-col gap-2">
              <Eyebrow>Déplacer</Eyebrow>

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
                  Rattacher sous un autre service
                </Label>
                {/* Descendants are absent from `moveTargets`, so a cycle cannot be chosen. Refusing a
                    selection after a page reload is a worse way to teach the same rule. No « au
                    sommet » option either: everything answers to the collège des anciens, so only
                    the rosters are roots — a parentless legacy node picks its place from here. */}
                <select
                  id={`move-${node.id}`}
                  name="parentRoleId"
                  required
                  className={selectClass}
                  defaultValue={node.parentId == null ? '' : String(node.parentId)}
                >
                  {node.parentId == null && (
                    <option value="" disabled>
                      — Choisir un service —
                    </option>
                  )}
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
            </section>
          )}

          <section className="flex flex-col gap-2">
            <Eyebrow>Ajouter un service en dessous</Eyebrow>

            {/* One form, no mode toggle: pick an existing service OR type a new name, and the
                action does whichever was filled in. The old radio pair asked « existant ou
                nouveau ? » before the admin could even see their options. */}
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="attach" />
              <input type="hidden" name="parentRoleId" value={node.id} />

              {adoptable.length > 0 && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`attach-${node.id}`} className="text-muted-foreground text-xs">
                    Un service existant
                  </Label>
                  <select id={`attach-${node.id}`} name="roleId" defaultValue="" className={selectClass}>
                    <option value="">— Choisir un service —</option>
                    {adoptable.map(role => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <Label htmlFor={`attach-name-${node.id}`} className="text-muted-foreground text-xs">
                  {adoptable.length > 0 ? 'Ou un nouveau service' : 'Un nouveau service'}
                </Label>
                <input
                  id={`attach-name-${node.id}`}
                  type="text"
                  name="name"
                  maxLength={100}
                  placeholder="Nom du service"
                  className={selectClass}
                />
                <label className="flex items-center gap-2 pt-1 text-muted-foreground text-sm">
                  <input type="checkbox" name="singlePerson" className="size-4" />
                  Rôle personnel (un seul responsable)
                </label>
              </div>

              {/* The label carries the node's name, and «Coordinateur du collège des anciens» is
                  wider than a 22rem column — so the button wraps rather than clipping it. */}
              <Button type="submit" variant="outline" className="h-auto min-h-11 whitespace-normal py-2 text-center">
                Rattacher à « {node.name} »
              </Button>
            </Form>
          </section>

          {!node.isRoster && !node.isFixed && (
            <Form method="post">
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
      </details>
    </div>
  )
}
