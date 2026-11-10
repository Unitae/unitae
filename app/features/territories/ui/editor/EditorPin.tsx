import { Check, Plus, X } from 'lucide-react'

import type { PinState } from '~/features/territories/model/territory-draft'
import { cn } from '~/shared/utils/utils'

// One look per state. Free reads as « nothing yet »: the neutral dashed circle of the lists, never green.
const LOOK: Record<PinState, string> = {
  in: 'size-4.5 bg-primary text-primary-foreground ring-2 ring-surface shadow-sm',
  free: 'size-4.5 border-[1.5px] border-dashed border-faint bg-surface shadow-sm',
  other: 'size-2.5 bg-faint/70 ring-2 ring-surface',
  add: 'size-4.5 bg-primary text-primary-foreground ring-2 ring-surface outline-[1.5px] outline-primary outline-offset-[3px] shadow-sm',
  remove: 'size-4.5 border-2 border-destructive bg-surface text-destructive shadow-sm',
}

const ICON = { in: Check, add: Plus, remove: X } as const

/** An entrance's mark on the editor's map, and in its legend and card at a smaller `size`. */
export function EditorPin({ state, size = 'map' }: { state: PinState; size?: 'map' | 'small' }) {
  const Icon = state in ICON ? ICON[state as keyof typeof ICON] : null
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-content-center rounded-full',
        LOOK[state],
        size === 'small' && (state === 'other' ? 'size-2' : 'size-3.5 outline-offset-2'),
      )}
    >
      {Icon != null && <Icon className={size === 'small' ? 'size-2.5' : 'size-3'} strokeWidth={3} />}
    </span>
  )
}
