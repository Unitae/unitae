import { useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

function formatDayHint(days: number): string {
  if (days < 14) return `${days} jour${days > 1 ? 's' : ''}`
  if (days < 28) {
    const weeks = Math.round(days / 7)
    return `= ${weeks} semaine${weeks > 1 ? 's' : ''}`
  }
  const months = Math.round(days / 30)
  return `≈ ${months} mois`
}

interface Props {
  field: { id: string; name: string; errors?: string[] }
  label: string
  hint: string
  defaultValue: number
  onChange: () => void
}

/** A day count with a live "≈ 4 mois" readout beside it. */
export function DurationInput({ field, label, hint, defaultValue, onChange }: Props) {
  const [hint_, setHint] = useState(formatDayHint(defaultValue))

  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>{label}</Label>
      <div className="flex items-center gap-3">
        <Input
          id={field.id}
          name={field.name}
          type="number"
          min={1}
          max={365}
          defaultValue={defaultValue}
          className="w-28"
          onChange={e => {
            const v = Number(e.target.value)
            if (v > 0) setHint(formatDayHint(v))
            onChange()
          }}
        />
        <span className="text-muted-foreground text-sm">{m.settings_territories_attribution_duration_days_unit()}</span>
        <span className="text-muted-foreground text-xs">{hint_}</span>
      </div>
      {field.errors && <p className="text-destructive text-sm">{field.errors}</p>}
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  )
}
