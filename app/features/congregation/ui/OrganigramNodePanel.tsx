import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Form } from 'react-router'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import { PersonDropdown, type PersonOption } from '~/shared/ui/PersonDropdown'
import { cn } from '~/shared/utils/utils'

// Everything that mutates the organigram lives here, scoped to one node.
//
// The chart never mutates: you select a node and act on it in one place, instead of
// re-identifying it in a dropdown that repeats the tree you were already looking at. This is
// rendered in a sidebar on desktop and a bottom sheet on mobile — same content, same markup.

export interface PanelHolder {
  memberId: number
  name: string
  kind: string
}

export interface PanelNode {
  id: number
  name: string
  isRoster: boolean
  parentId: number | null
  parentName: string | null
  childCount: number
  holders: PanelHolder[]
}

interface Props {
  node: PanelNode
  /** Everyone in the congregation; those without a login are disabled with a reason. */
  people: PersonOption[]
  peopleWithoutAccount: number[]
  /** Roles that exist but are not yet in the chart. */
  adoptable: { id: number; name: string }[]
  /** Every node in the chart except this one and its descendants — legal parents. */
  moveTargets: { id: number; label: string }[]
}

const KIND_LABEL: Record<string, string> = {
  leader: 'Responsable',
  deputy: 'Adjoint',
  member: 'Membre',
}

const selectClass =
  'h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

/** Secondary controls sit inside a row that already has a primary button; keep them recessive. */
const quietSelectClass =
  'h-11 flex-1 rounded-md border border-input bg-muted/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

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

function HolderRow({ holder, nodeId, nodeName }: { holder: PanelHolder; nodeId: number; nodeName: string }) {
  return (
    <li className="-mx-2 flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-muted/50">
      <span className="min-w-0 flex-1 truncate text-sm">{holder.name}</span>

      {/* Changing someone from membre to responsable is one control, not unseat-then-reseat:
          the service upserts on (member, role), so re-submitting with a new kind is the change. */}
      <Form method="post">
        <input type="hidden" name="intent" value="seat" />
        <input type="hidden" name="roleId" value={nodeId} />
        <input type="hidden" name="memberId" value={holder.memberId} />
        <select
          name="kind"
          defaultValue={holder.kind}
          aria-label={`Fonction de ${holder.name} dans ${nodeName}`}
          // The seat is set once and then read; a full-strength box on every row turned a list
          // of six people into six form controls. Borderless until you go near it — still 36px
          // tall, well past the 24px WCAG 2.2 target minimum.
          className="h-9 rounded-md border border-transparent bg-transparent px-1 text-muted-foreground text-xs outline-none hover:border-input hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={event => event.currentTarget.form?.requestSubmit()}
        >
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {/* Without JavaScript the select cannot self-submit, so keep a real button available. */}
        <noscript>
          <Button type="submit" variant="outline" size="sm">
            OK
          </Button>
        </noscript>
      </Form>

      <Form method="post">
        <input type="hidden" name="intent" value="unseat" />
        <input type="hidden" name="roleId" value={nodeId} />
        <input type="hidden" name="memberId" value={holder.memberId} />
        {/* Muted rather than hidden-until-hover: on a touch screen there is no hover, and a
            control that only exists on a pointer device is a control half the users never get. */}
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Retirer ${holder.name} de ${nodeName}`}
        >
          <X className="size-4" />
        </Button>
      </Form>
    </li>
  )
}

export function OrganigramNodePanel({ node, people, peopleWithoutAccount, adoptable, moveTargets }: Props) {
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

      <Section first>
        <SectionTitle>Personnes</SectionTitle>

        {node.holders.length === 0 ? (
          <p className="text-muted-foreground text-sm">Personne pour l’instant.</p>
        ) : (
          <ul className="flex flex-col">
            {node.holders.map(holder => (
              <HolderRow key={holder.memberId} holder={holder} nodeId={node.id} nodeName={node.name} />
            ))}
          </ul>
        )}

        {/* The rosters are reconciled from Member flags — seating into them by hand would be
            overwritten on the next sync, so the form is simply not offered. */}
        {!node.isRoster && (
          <Form method="post" className="flex flex-col gap-2 pt-2">
            <input type="hidden" name="intent" value="seat" />
            <input type="hidden" name="roleId" value={node.id} />

            <Label htmlFor={`add-person-${node.id}`} className="text-muted-foreground text-xs">
              Ajouter une personne
            </Label>
            {/* Searchable rather than a plain select: ~80 candidates is far past the point where
                scrolling a list is workable, and members with no login must show why. */}
            <PersonDropdown
              id={`add-person-${node.id}`}
              name="memberId"
              people={people}
              allowNone={false}
              placeholder="Chercher une personne…"
              disabledIds={peopleWithoutAccount}
              disabledReason={() => 'Pas de compte'}
            />
            <div className="flex gap-2">
              <select name="kind" defaultValue="member" aria-label="En tant que" className={quietSelectClass}>
                {Object.entries(KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button type="submit">Ajouter</Button>
            </div>
          </Form>
        )}
      </Section>

      {!node.isRoster && (
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

      {!node.isRoster && (
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
