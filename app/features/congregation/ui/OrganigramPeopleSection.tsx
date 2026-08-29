import { X } from 'lucide-react'
import { Form } from 'react-router'
import type { PanelNode } from '~/features/congregation/ui/OrganigramNodePanel'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import { PersonDropdown, type PersonOption } from '~/shared/ui/PersonDropdown'

// Who is in a node, and how to add someone — split out of the panel because the three service
// committee posts change nearly every line of it: one seat instead of many, elders only, and a
// replace rather than an add.

export interface PanelHolder {
  memberId: number
  name: string
  kind: string
}

const KIND_LABEL: Record<string, string> = {
  leader: 'Responsable',
  deputy: 'Adjoint',
  member: 'Membre',
}

/** Secondary controls sit inside a row that already has a primary button; keep them recessive. */
const quietSelectClass =
  'h-11 flex-1 rounded-md border border-input bg-muted/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-medium text-sm">{children}</h3>
}

function HolderRow({
  holder,
  nodeId,
  nodeName,
  isPost = false,
  readOnly = false,
}: {
  holder: PanelHolder
  nodeId: number
  nodeName: string
  isPost?: boolean
  /** A derived membership: showing controls that the next reconcile would undo is worse than none. */
  readOnly?: boolean
}) {
  return (
    <li className="-mx-2 flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-muted/50">
      <span className="min-w-0 flex-1 truncate text-sm">{holder.name}</span>

      {/* A post is held by one person; there is no membre/adjoint choice to offer. */}
      {isPost && <span className="text-muted-foreground text-xs">Ancien</span>}

      {/* Changing someone from membre to responsable is one control, not unseat-then-reseat:
          the service upserts on (member, role), so re-submitting with a new kind is the change. */}
      {!isPost && !readOnly && (
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
      )}

      {!readOnly && (
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
      )}
    </li>
  )
}

/**
 * Who is in this node, and how to add someone.
 *
 * Extracted from the panel because the three committee posts change nearly every line of it —
 * one seat instead of many, elders only, a replace rather than an add — and inlining that many
 * branches pushed the panel past the complexity budget.
 */
export function PeopleSection({
  node,
  people,
  peopleWithoutAccount,
  nonElderIds,
}: {
  node: PanelNode
  people: PersonOption[]
  peopleWithoutAccount: number[]
  nonElderIds: number[]
}) {
  const outgoing = node.isPost ? node.holders[0] : undefined

  return (
    <section className="flex flex-col gap-2 pt-5">
      <SectionTitle>Personnes</SectionTitle>

      {node.holders.length === 0 ? (
        <p className="text-muted-foreground text-sm">Personne pour l’instant.</p>
      ) : (
        <ul className="flex flex-col">
          {node.holders.map(holder => (
            <HolderRow
              key={holder.memberId}
              holder={holder}
              nodeId={node.id}
              nodeName={node.name}
              isPost={node.isPost}
              readOnly={node.isCommittee}
            />
          ))}
        </ul>
      )}

      {node.isCommittee && (
        <p className="text-muted-foreground text-sm">
          Le comité est composé du coordinateur, du secrétaire et du surveillant du service. Nommez-les dans leurs
          fonctions et ils apparaissent ici.
        </p>
      )}

      {/* A derived list is not editable by hand: the rosters are reconciled from Member flags,
          and the committee from whoever holds its three posts. A form whose result the next
          reconcile would silently undo is worse than no form. */}
      {!node.isRoster && !node.isCommittee && (
        <Form method="post" className="flex flex-col gap-2 pt-2">
          <input type="hidden" name="intent" value="seat" />
          <input type="hidden" name="roleId" value={node.id} />

          <Label htmlFor={`add-person-${node.id}`} className="text-muted-foreground text-xs">
            {!node.isPost ? 'Ajouter une personne' : outgoing ? 'Remplacer par' : 'Nommer un ancien'}
          </Label>
          {/* Searchable rather than a plain select: ~80 candidates is far past the point where
                scrolling a list is workable, and members with no login must show why. */}
          <PersonDropdown
            id={`add-person-${node.id}`}
            name="memberId"
            people={people}
            allowNone={false}
            placeholder="Chercher une personne…"
            disabledIds={node.isPost ? nonElderIds : peopleWithoutAccount}
            disabledReason={id => (node.isPost && !peopleWithoutAccount.includes(id) ? 'Pas ancien' : 'Pas de compte')}
          />
          <div className="flex gap-2">
            {/* A post is single-seat, so `kind` is decided by the service — offering a choice
                  here would be offering something that is then overwritten. */}
            {node.isPost ? (
              <input type="hidden" name="kind" value="leader" />
            ) : (
              <select name="kind" defaultValue="member" aria-label="En tant que" className={quietSelectClass}>
                {Object.entries(KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            <Button type="submit" className={node.isPost ? 'w-full' : undefined}>
              {outgoing ? 'Remplacer' : 'Ajouter'}
            </Button>
          </div>
          {outgoing && (
            // The handover is the point, but it must not be a surprise.
            <p className="text-muted-foreground text-xs">
              {outgoing.name} quittera cette fonction et les permissions qui l’accompagnent.
            </p>
          )}
        </Form>
      )}
    </section>
  )
}
