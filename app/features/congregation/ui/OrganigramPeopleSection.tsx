import { X } from 'lucide-react'
import { useState } from 'react'
import { Form, Link as RouterLink } from 'react-router'
import type { PanelNode } from '~/features/congregation/ui/OrganigramNodePanel'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import { PersonDropdown, type PersonOption } from '~/shared/ui/PersonDropdown'

// Who is in a node, and how to add someone — split out of the panel because personal roles
// change nearly every line of it: a titular seat instead of plain members, a replace rather
// than an add, and (on the committee posts) elders only.

export interface PanelHolder {
  memberId: number
  name: string
  kind: string
}

// The organigram names who *leads*: the chart seats responsables and adjoints, and the role
// matrix (« Groupes d'aptitude ») handles plain members in bulk. Splitting the two gestures is
// what keeps each page simple — and keeps a stray click here from touching a whole team.
const KIND_LABEL: Record<string, string> = {
  leader: 'Responsable',
  deputy: 'Adjoint',
}

// On a personal role nobody is «responsable of» it — the node name is the function, and the
// person holds it. Its seats are the titulaire and the adjoints.
const SINGLE_KIND_LABEL: Record<string, string> = {
  leader: 'Titulaire',
  deputy: 'Adjoint',
}

const SEAT_KINDS = ['leader', 'deputy'] as const

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
  kinds,
  labels,
  showElderChip = false,
  readOnly = false,
}: {
  holder: PanelHolder
  nodeId: number
  nodeName: string
  /** Which seats this node offers — no «membre» on a personal role. */
  kinds: readonly string[]
  /** How those seats are named — «Titulaire» rather than «Responsable» on a personal role. */
  labels: Record<string, string>
  /** The committee posts' titulaire is an elder; say so where the person is shown. */
  showElderChip?: boolean
  /** A derived membership: showing controls that the next reconcile would undo is worse than none. */
  readOnly?: boolean
}) {
  return (
    <li className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent/40">
      <span className="min-w-0 flex-1 truncate text-sm">{holder.name}</span>

      {showElderChip && <span className="text-muted-foreground text-xs">Ancien</span>}

      {/* Changing someone's seat is one control, not unseat-then-reseat: the service upserts on
          (member, role), so re-submitting with a new kind is the change. On a personal role,
          promoting an adjoint to responsable is the handover. */}
      {!readOnly && (
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
            // 44px on touch screens, where the finger is the pointer; 36px from md up, where the
            // panel column is tight and a mouse does not need the slack.
            className="h-11 rounded-md border border-transparent bg-transparent px-1 text-muted-foreground text-xs outline-none hover:border-primary/30 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-9"
            onChange={event => event.currentTarget.form?.requestSubmit()}
          >
            {kinds.map(value => (
              <option key={value} value={value}>
                {labels[value]}
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
            className="size-11 text-muted-foreground hover:text-destructive md:size-9"
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
 * Extracted from the panel because personal roles change nearly every line of it — a titular
 * seat instead of plain members, a replace rather than an add, elders only on the posts — and
 * inlining that many branches pushed the panel past the complexity budget.
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
  const single = node.isSinglePerson
  const labels = single ? SINGLE_KIND_LABEL : KIND_LABEL
  const titular = node.holders.find(holder => holder.kind === 'leader')
  // Controlled: on a post, who the picker may offer depends on which seat is being filled —
  // the titulaire must be an elder, an adjoint need not be.
  const [kind, setKind] = useState<string>(titular ? 'deputy' : 'leader')
  const seatingTitular = single && kind === 'leader'
  const elderOnly = node.isPost && seatingTitular

  return (
    <section className="flex flex-col gap-2 pt-5">
      <SectionTitle>Personnes</SectionTitle>

      {node.holders.length === 0 ? (
        <p className="text-muted-foreground text-sm">Personne pour l’instant.</p>
      ) : (
        // Capped so a full roster scrolls inside its section instead of ballooning the panel —
        // on a phone the sheet is 60vh, and the seat form must stay reachable.
        <ul className="-mx-2 flex max-h-56 flex-col overflow-y-auto overflow-x-hidden px-2">
          {node.holders.map(holder => (
            <HolderRow
              key={holder.memberId}
              holder={holder}
              nodeId={node.id}
              nodeName={node.name}
              kinds={SEAT_KINDS}
              labels={labels}
              showElderChip={node.isPost && holder.kind === 'leader'}
              // Plain members are the matrix's to edit; this list only *shows* them, so a
              // stray click while reviewing a team cannot remove half of it.
              readOnly={node.isCommittee || node.isRoster || holder.kind === 'member'}
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
            {!single
              ? 'Nommer un responsable ou un adjoint'
              : titular
                ? 'Ajouter ou remplacer'
                : node.isPost
                  ? 'Nommer un ancien'
                  : 'Nommer le titulaire'}
          </Label>
          {/* Searchable rather than a plain select: ~80 candidates is far past the point where
                scrolling a list is workable, and members with no login must show why. */}
          <PersonDropdown
            id={`add-person-${node.id}`}
            name="memberId"
            people={people}
            allowNone={false}
            placeholder="Chercher une personne…"
            disabledIds={elderOnly ? nonElderIds : peopleWithoutAccount}
            disabledReason={id => (elderOnly && !peopleWithoutAccount.includes(id) ? 'Pas ancien' : 'Pas de compte')}
          />
          <div className="flex gap-2">
            <select
              name="kind"
              value={kind}
              onChange={event => setKind(event.currentTarget.value)}
              aria-label="En tant que"
              className={quietSelectClass}
            >
              {SEAT_KINDS.map(value => (
                <option key={value} value={value}>
                  {labels[value]}
                </option>
              ))}
            </select>
            <Button type="submit">{seatingTitular && titular ? 'Remplacer' : 'Ajouter'}</Button>
          </div>
          {seatingTitular && titular && (
            // The handover is the point, but it must not be a surprise.
            <p className="text-muted-foreground text-xs">
              {titular.name} quittera cette fonction et les permissions qui l’accompagnent.
            </p>
          )}
          {!single && (
            <p className="text-muted-foreground text-xs">
              Les membres de l’équipe s’ajoutent depuis les{' '}
              <RouterLink to="/congregation/roles" className="underline underline-offset-2 hover:text-foreground">
                groupes d’aptitude
              </RouterLink>
              .
            </p>
          )}
        </Form>
      )}
    </section>
  )
}
