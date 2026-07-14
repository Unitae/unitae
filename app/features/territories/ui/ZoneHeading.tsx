import { cn } from '~/shared/utils/utils'

interface ZoneHeadingProps {
  eyebrow: string
  title: string
  className?: string
}

export function ZoneHeading({ eyebrow, title, className }: ZoneHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{eyebrow}</span>
      <h2 className="font-display font-semibold text-xl">{title}</h2>
    </div>
  )
}
