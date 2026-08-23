import { cn } from '~/shared/utils/utils'

interface FormActionsProps {
  children: React.ReactNode
  className?: string
}

/**
 * Footer for form pages: on phones the actions dock above the bottom tab bar
 * so the submit action is always reachable; on larger screens they sit inline
 * after the form sections, matching the existing layout.
 *
 * Fixed rather than sticky — the app shell's overflow-x-hidden content
 * wrapper would swallow a sticky element (it becomes the sticky containment
 * root while the document does the scrolling).
 */
export function FormActions({ children, className }: FormActionsProps) {
  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] max-sm:z-20 max-sm:border-t max-sm:bg-background/85 max-sm:px-4 max-sm:py-2.5 max-sm:backdrop-blur-sm',
          className,
        )}
      >
        {children}
      </div>
      <div aria-hidden className="h-14 sm:hidden" />
    </>
  )
}
