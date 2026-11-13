import { ChevronDown, ChevronUp } from 'lucide-react'
import { useFetcher } from 'react-router'
import type { PanelRole } from '~/features/congregation/model/organigram-page.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/shared/ui/collapsible'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

// Where a role stands: up or down among its siblings, under which role, or out of the chart. Occasional, so folded.
// The lists, the committee and its posts have a fixed place and only say so, with why a built-in one has no
// « Modifier ».

export function RolePlace({ role }: { role: PanelRole }) {
  const fetcher = useFetcher()
  const busy = fetcher.state !== 'idle'
  const submit = (fields: Record<string, string>) =>
    fetcher.submit({ roleId: String(role.id), ...fields }, { method: 'post' })

  if (role.offChart) return <AttachPlace role={role} />

  if (role.kind !== 'team' && role.kind !== 'personal') {
    return (
      <section className="flex flex-col gap-1.5 py-3.5 first:pt-0 last:pb-0">
        <p className="text-faint text-xs">
          {role.kind === 'roster' ? m.org_place_fixed_roster() : m.org_place_fixed_committee()}
        </p>
        {/* Without it a built-in role shows no way to rename it and no reason why. */}
        {!role.editable && (
          <p className="text-faint text-xs">
            {m.org_built_in_note({ settings: m.settings_title(), roles: m.settings_entry_roles() })}
          </p>
        )}
      </section>
    )
  }

  const { index, of } = role.position
  return (
    <Collapsible className="py-3.5 first:pt-0 last:pb-0">
      <CollapsibleTrigger className="group focus-visible:ring-ring flex w-full items-center gap-1.5 text-sm font-semibold outline-none focus-visible:ring-2">
        <ChevronDown
          aria-hidden="true"
          className="text-faint size-4 transition-transform group-data-[state=closed]:-rotate-90"
        />
        {m.org_place_title()}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground flex-1 text-sm">
            {role.parent
              ? m.org_place_position({ index: String(index), of: String(of), parent: role.parent.name })
              : m.org_top()}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={m.org_move_up()}
            disabled={busy || index <= 1}
            onClick={() => submit({ intent: 'move', direction: 'up' })}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={m.org_move_down()}
            disabled={busy || index >= of}
            onClick={() => submit({ intent: 'move', direction: 'down' })}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`role-parent-${role.id}`}>{m.org_place_under()}</Label>
          <Select
            value={role.parent ? String(role.parent.id) : undefined}
            onValueChange={value => submit({ intent: 'set-parent', parentRoleId: value })}
            disabled={busy}
          >
            <SelectTrigger id={`role-parent-${role.id}`} className="w-full" aria-label={m.org_place_under_label()}>
              {/* The list indents each role under its parent; the chosen one reads plain. */}
              <SelectValue>{role.parent?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {role.moveTargets.map(target => (
                <SelectItem key={target.id} value={String(target.id)}>
                  {target.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive self-start"
          disabled={busy}
          onClick={() => submit({ intent: 'remove' })}
        >
          {m.org_place_remove()}
        </Button>
        <p className="text-faint text-xs">{m.org_place_remove_hint()}</p>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A role outside the chart: attached under a chart role, it gets its box there and on the board. */
function AttachPlace({ role }: { role: PanelRole }) {
  const fetcher = useFetcher()
  return (
    <section className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <h3 className="text-sm font-semibold">{m.org_place_title()}</h3>
      <p className="text-faint text-xs">{m.org_place_off_chart_hint()}</p>
      <Label htmlFor={`role-attach-${role.id}`} className="pt-1">
        {m.org_place_attach()}
      </Label>
      <Select
        onValueChange={value =>
          fetcher.submit({ intent: 'add', roleId: String(role.id), parentRoleId: value }, { method: 'post' })
        }
        disabled={fetcher.state !== 'idle' || role.moveTargets.length === 0}
      >
        <SelectTrigger id={`role-attach-${role.id}`} className="w-full">
          <SelectValue placeholder={m.org_place_attach_placeholder()} />
        </SelectTrigger>
        <SelectContent>
          {role.moveTargets.map(target => (
            <SelectItem key={target.id} value={String(target.id)}>
              {target.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  )
}
