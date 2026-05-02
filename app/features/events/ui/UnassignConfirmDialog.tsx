import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'

type UnassignTarget = {
  type: 'part' | 'service'
  id: number
  name: string
  assigneeName: string
}

type UnassignConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: UnassignTarget | null
  eventId: number
}

export function UnassignConfirmDialog({ open, onOpenChange, target, eventId }: UnassignConfirmDialogProps) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const prevState = useRef(fetcher.state)

  useEffect(() => {
    if (prevState.current === 'submitting' && fetcher.state === 'idle') {
      onOpenChange(false)
    }
    prevState.current = fetcher.state
  }, [fetcher.state, onOpenChange])

  function handleConfirm() {
    if (!target) return
    fetcher.submit(null, {
      method: 'post',
      action: `/programs/events/${eventId}/remove-assignment?type=${target.type}&id=${target.id}`,
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{m.programs_view_unassign_confirm_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? m.programs_view_unassign_confirm_description({ name: target.assigneeName, part: target.name })
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={fetcher.state !== 'idle'}>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm} disabled={fetcher.state !== 'idle'}>
            {m.common_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
