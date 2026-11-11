import type { ReactNode } from 'react'
import { Label } from '~/shared/ui/label'
import { cn } from '~/shared/utils/utils'

interface SettingsFieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  className?: string
  children: ReactNode
}

/** One field of a settings form: its label, the control, then its hint or, once refused, why. */
export function SettingsField({ id, label, hint, error, className, children }: SettingsFieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-faint text-xs">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}
