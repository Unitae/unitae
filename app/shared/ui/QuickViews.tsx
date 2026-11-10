import { SegmentedControl } from '@unitae/ui'

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

/**
 * A list's quick views, each with how many items it holds. From the tablet up, the design system's segmented control,
 * small, the count faint after the label (two to five views, as the control takes). On a phone its equal segments no
 * longer fit, so the views become a row of chips that scrolls sideways, as the phone mockups draw them.
 */
export function QuickViews<V extends string>({ label, views, value, onChoose, className }: QuickViewsProps<V>) {
  return (
    <>
      <SegmentedControl
        aria-label={label}
        size="sm"
        value={value}
        onValueChange={onChoose}
        // As wide as its views, also where the parent stretches its children (a column).
        className={cn('w-fit max-md:hidden', className)}
        options={views.map(view => ({
          value: view.value,
          label: (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {view.label}
              <Count value={view.count} />
            </span>
          ),
        }))}
      />
      <fieldset
        className={cn(
          'm-0 flex min-w-0 basis-full gap-1.5 overflow-x-auto border-0 p-0 [scrollbar-width:none] md:hidden',
          className,
        )}
      >
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
                'inline-flex h-9 flex-none items-center gap-1.5 rounded-full border bg-card px-3 font-medium text-sm outline-none transition-colors duration-(--u-duration-fast) focus-visible:ring-2 focus-visible:ring-ring',
                pressed ? 'border-foreground text-foreground' : 'border-border text-muted-foreground',
              )}
            >
              {view.label}
              <Count value={view.count} />
            </button>
          )
        })}
      </fieldset>
    </>
  )
}

function Count({ value }: { value: number }) {
  return <span className="text-faint tabular-nums">{value}</span>
}
