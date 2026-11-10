import { StatusIcon } from '@unitae/ui'
import { Link } from 'react-router'

import { Label } from '~/shared/ui/label'
import { cn } from '~/shared/utils/utils'

const TONES = {
  error: { icon: 'danger', surface: 'bg-danger-soft', role: 'alert' },
  success: { icon: 'success', surface: 'bg-success-soft', role: 'status' },
  info: { icon: 'neutral', surface: 'bg-sidebar', role: 'status' },
} as const

/** A message in the column: what went wrong, or what just happened (a password changed, an address confirmed). */
export function AuthMessage({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  const { icon, surface, role } = TONES[tone]
  return (
    <div role={role} className={cn('flex items-start gap-2.5 rounded-md px-3 py-2.5 text-sm leading-relaxed', surface)}>
      <StatusIcon tone={icon} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

/** One field: its label (with a link beside it when there is one), the control, its help, its error. */
export function AuthField({
  id,
  label,
  aside,
  help,
  errorId,
  errors,
  children,
}: {
  id: string
  label: string
  aside?: React.ReactNode
  help?: string
  errorId?: string
  errors?: string[]
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      {children}
      {help != null && <p className="text-faint text-xs leading-relaxed">{help}</p>}
      {errors != null && errors.length > 0 && (
        <p id={errorId} className="text-destructive text-sm">
          {errors[0]}
        </p>
      )}
    </div>
  )
}

/** A quiet way out under the form: back to the sign-in page, another address. */
export function AuthLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="self-start text-brand-text text-sm underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}

export const AUTH_SUBMIT = 'h-10 w-full'
