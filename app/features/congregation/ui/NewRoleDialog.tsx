import { useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { RoleTypeChoice } from '~/features/congregation/ui/RoleForm'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Textarea } from '~/shared/ui/textarea'

// One form to create a role, from the header (place to choose) or from a role's panel (place already filled). Once
// created, the new role's panel opens to name its people.

const OFF_CHART = 'none'

export function NewRoleDialog({
  open,
  onOpenChange,
  places,
  defaultName = '',
  defaultParentId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every chart role, indented. */
  places: { id: number; label: string }[]
  defaultName?: string
  /** Where it goes; `null` outside the chart. */
  defaultParentId: number | null
  onCreated: (roleId: number) => void
}) {
  const fetcher = useFetcher<{ ok: true; roleId: number } | { ok: false; error: string }>()
  const result = fetcher.state === 'idle' ? fetcher.data : undefined
  const [place, setPlace] = useState(defaultParentId == null ? OFF_CHART : String(defaultParentId))
  const placeName = places.find(each => String(each.id) === place)?.label.trim() ?? m.org_new_off_chart()
  const created = useRef(onCreated)
  created.current = onCreated

  useEffect(() => {
    if (result?.ok) created.current(result.roleId)
  }, [result])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="create" />
          <DialogHeader>
            <DialogTitle>{m.org_new_title()}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-role-name">{m.org_form_name()}</Label>
            <Input
              id="new-role-name"
              name="name"
              defaultValue={defaultName}
              required
              maxLength={100}
              autoComplete="off"
              aria-invalid={result != null && !result.ok}
              aria-describedby={result != null && !result.ok ? 'new-role-error' : undefined}
            />
            {result != null && !result.ok && (
              <p id="new-role-error" role="alert" className="text-destructive text-sm">
                {result.error}
              </p>
            )}
          </div>
          <RoleTypeChoice id="new-role-type" defaultSingle={false} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-role-place">{m.org_new_place()}</Label>
            <Select name="parentRoleId" value={place} onValueChange={setPlace}>
              <SelectTrigger id="new-role-place" className="w-full" aria-describedby="new-role-place-hint">
                {/* The list indents each role under its parent; the chosen one reads plain. */}
                <SelectValue>{placeName}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {places.map(place => (
                  <SelectItem key={place.id} value={String(place.id)}>
                    {place.label}
                  </SelectItem>
                ))}
                <SelectItem value={OFF_CHART}>{m.org_new_off_chart()}</SelectItem>
              </SelectContent>
            </Select>
            <p id="new-role-place-hint" className="text-faint text-xs">
              {m.org_new_off_chart_hint()}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-role-description">
              {m.org_form_description()}
              <span className="text-faint font-normal"> · {m.org_form_optional()}</span>
            </Label>
            <Textarea id="new-role-description" name="description" rows={2} maxLength={1000} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              {m.org_new_create()}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}
