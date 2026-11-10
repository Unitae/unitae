import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/shared/utils/utils'

interface SettingRowProps {
  title: ReactNode
  /** What the setting does, when it is not obvious, in a quiet line under the title. */
  description?: ReactNode
  /** A state beside the title, e.g. « Activée depuis le 3 mars ». */
  status?: ReactNode
  icon?: LucideIcon
  /** The control at the end of the row: a button, a switch, a menu. */
  children?: ReactNode
  /**
   * The id of a switch or checkbox the row toggles: the whole row becomes its label. Without it, a button control
   * drops under the text, full width, on a phone.
   */
  htmlFor?: string
  className?: string
}

/** One setting in a panel: title and description on the left, its control on the right. */
export function SettingRow({ title, description, status, icon: Icon, children, htmlFor, className }: SettingRowProps) {
  const text = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-medium text-sm">
        {Icon && <Icon className="size-4 shrink-0 text-faint" aria-hidden="true" />}
        {title}
        {status}
      </span>
      {description && <span className="text-faint text-sm leading-relaxed">{description}</span>}
    </span>
  )
  const row = 'flex gap-5 border-t px-4.5 py-3.5 first:border-t-0'

  if (htmlFor) {
    return (
      <label htmlFor={htmlFor} className={cn(row, 'cursor-pointer items-center', className)}>
        {text}
        {children && <span className="shrink-0">{children}</span>}
      </label>
    )
  }
  return (
    <div className={cn(row, 'items-center max-sm:flex-col max-sm:items-stretch max-sm:gap-3', className)}>
      {text}
      {children && (
        <div className="flex shrink-0 items-center gap-2 max-sm:[&>*]:h-11 max-sm:[&>*]:w-full">{children}</div>
      )}
    </div>
  )
}
