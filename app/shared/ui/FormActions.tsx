import { cn } from '~/shared/utils/utils'

interface FormActionsProps {
  children: React.ReactNode
  /**
   * Dock the actions above the mobile tab bar (default). Pass false on pages
   * where the form is one section among others — a persistently hovering save
   * bar over unrelated content reads as noise there.
   */
  dock?: boolean
  className?: string
}

/**
 * Footer for form pages: on phones the actions dock above the bottom tab bar
 * so the submit action is always reachable; on larger screens they sit inline
 * after the form sections, matching the existing layout.
 *
 * Fixed rather than sticky — the app shell's overflow-x-hidden content
 * wrapper would swallow a sticky element (it becomes the sticky containment
 * root while the document does the scrolling). The shell reserves the bar's
 * height at the bottom of the scroll area via the data-form-actions marker,
 * so content after the form can still scroll clear of it.
 */
export function FormActions({ children, dock = true, className }: FormActionsProps) {
  return (
    <div
      data-form-actions={dock ? '' : undefined}
      className={cn(
        'flex items-center gap-2',
        dock &&
          'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] max-sm:z-20 max-sm:border-t max-sm:bg-background/85 max-sm:px-4 max-sm:py-2.5 max-sm:backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}
