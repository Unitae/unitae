import { cn } from '~/shared/utils/utils'

export interface QuickView<V extends string> {
  value: V
  label: string
  count: number
}

interface QuickViewsProps<V extends string> {
  /** Names the group for screen readers. */
  label: string
  views: QuickView<V>[]
  value: V
  onChoose: (value: V) => void
  className?: string
}

/** A list's quick views, each with how many items it holds: one press shows them, the pressed one stays outlined. */
export function QuickViews<V extends string>({ label, views, value, onChoose, className }: QuickViewsProps<V>) {
  return (
    <fieldset className={cn('flex flex-wrap gap-1', className)}>
      <legend className="sr-only">{label}</legend>
      {views.map(view => {
        const pressed = view.value === value
        return (
          <button
            key={view.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChoose(view.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-sm outline-none transition-colors duration-(--u-duration-fast) focus-visible:ring-2 focus-visible:ring-ring max-md:h-11',
              pressed
                ? 'border-foreground text-foreground'
                : 'border-border text-muted-foreground hover:bg-hover hover:text-foreground',
            )}
          >
            {view.label}
            <span className="text-faint tabular-nums">{view.count}</span>
          </button>
        )
      })}
    </fieldset>
  )
}
