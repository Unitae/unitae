import { cn } from '~/shared/utils/utils'

interface ZoneHeadingProps {
  eyebrow: string
  title: string
  className?: string
}

export function ZoneHeading({ eyebrow, title, className }: ZoneHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="font-medium text-faint text-xs">{eyebrow}</span>
      <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
    </div>
  )
}
