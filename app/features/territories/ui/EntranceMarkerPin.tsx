import { Check, Plus, X } from 'lucide-react'

export type EntrancePinVariant =
  | 'in-territory'
  | 'available'
  | 'on-other'
  | 'pending-add'
  | 'pending-remove'

const PIN_BASE = 'flex size-7 items-center justify-center rounded-full border-2 shadow-md transition'

const VARIANT_CLASS: Record<EntrancePinVariant, string> = {
  'in-territory': 'border-blue-700 bg-blue-600 text-white',
  available: 'border-emerald-700 bg-emerald-500 text-white',
  'on-other': 'border-slate-400 bg-white text-slate-500',
  'pending-add': 'border-blue-700 bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-2 ring-offset-white',
  'pending-remove': 'border-destructive bg-destructive text-white',
}

function VariantIcon({ variant }: { variant: EntrancePinVariant }) {
  if (variant === 'pending-remove') return <X className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
  if (variant === 'pending-add') return <Plus className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
  if (variant === 'in-territory') return <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
  return null
}

type Props = {
  variant?: EntrancePinVariant
  className?: string
}

export function EntranceMarkerPin({ variant = 'in-territory', className }: Props) {
  return (
    <span className={`${PIN_BASE} ${VARIANT_CLASS[variant]} ${className ?? ''}`}>
      <VariantIcon variant={variant} />
    </span>
  )
}
