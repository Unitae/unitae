import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Form } from 'react-router'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import { PersonDropdown, type PersonOption } from '~/shared/ui/PersonDropdown'

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{children}</h3>
}

function HolderRow({ holder, nodeId, nodeName }: { holder: PanelHolder; nodeId: number; nodeName: string }) {
  return (
    <li className="flex items-center gap-2 border-b py-1 last:border-b-0">
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
          className="h-11 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
        <Button type="submit" variant="ghost" size="icon" aria-label={`Retirer ${holder.name} de ${nodeName}`}>
          <X className="size-4" />
        </Button>
      </Form>
    </li>
  )
}

export function OrganigramNodePanel({ node, people, peopleWithoutAccount, adoptable, moveTargets }: Props) {
  return (
    <div className="flex flex-col gap-6">
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

      <section className="flex flex-col gap-2">
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
      </section>

      {!node.isRoster && (
        <section className="flex flex-col gap-2">
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
        </section>
      )}

      {adoptable.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Rattacher un service</SectionTitle>
          {/* Node-scoped on purpose: the parent is the node you already selected, so there is no
              second choice to make and no way to pick the wrong one. */}
          <Form method="post" className="flex flex-col gap-2">
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="parentRoleId" value={node.id} />
            <select name="roleId" aria-label="Service à rattacher" className={selectClass} required>
              {adoptable.map(role => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Rattacher à « {node.name} »
            </Button>
          </Form>
        </section>
      )}

      {!node.isRoster && (
        <Form method="post" className="border-t pt-4">
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
