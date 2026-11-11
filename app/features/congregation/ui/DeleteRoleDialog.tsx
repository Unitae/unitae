import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'

// Deleting a role is final, so it asks; and a role that alone reserves a board section, a territory kind or a part
// cannot go — the server refuses, and the dialog lists what to give to another role first.

type DeleteResult = { ok: true } | { ok: false; error: string; reserves?: string[] }

export function DeleteRoleDialog({
  role,
  peopleCount,
  open,
  onOpenChange,
  onDeleted,
}: {
  role: { id: number; name: string }
  peopleCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const fetcher = useFetcher<DeleteResult>()
  const result = fetcher.state === 'idle' ? fetcher.data : undefined
  const reserves = result && !result.ok ? (result.reserves ?? []) : []
  const refusal = result && !result.ok && reserves.length === 0 ? result.error : null
  const done = useRef(onDeleted)
  done.current = onDeleted

  useEffect(() => {
    if (result?.ok) done.current()
  }, [result])

  const people =
    peopleCount === 0
      ? m.org_delete_people_none()
      : peopleCount === 1
        ? m.org_delete_people_one()
        : m.org_delete_people_many({ count: String(peopleCount) })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {reserves.length > 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>{m.org_reserves_title({ name: role.name })}</DialogTitle>
              <DialogDescription>{m.org_reserves_body()}</DialogDescription>
            </DialogHeader>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {reserves.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="text-muted-foreground text-sm">{m.org_reserves_hint()}</p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {m.org_reserves_ok()}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <fetcher.Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="roleId" value={role.id} />
            <DialogHeader>
              <DialogTitle>{m.org_delete_title({ name: role.name })}</DialogTitle>
              <DialogDescription>{people}</DialogDescription>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">{m.org_delete_final()}</p>
            {refusal && (
              <p role="alert" className="text-destructive text-sm">
                {refusal}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {m.common_cancel()}
              </Button>
              <Button type="submit" variant="destructive" disabled={fetcher.state !== 'idle'}>
                {m.org_delete()}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
