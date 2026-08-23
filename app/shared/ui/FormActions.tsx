import { cn } from '~/shared/utils/utils'

interface FormActionsProps {
  children: React.ReactNode
  className?: string
}

/**
 * Footer for form pages: on phones the actions stick to the bottom of the
 * viewport above the keyboard-safe area so "Enregistrer" is always reachable;
 * on larger screens they sit inline after the form sections, matching the
 * existing layout.
 */
export function FormActions({ children, className }: FormActionsProps) {
  return (
    <div
      className={cn(
        'max-sm:-mx-4 flex items-center gap-2 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:border-t max-sm:bg-background/85 max-sm:px-4 max-sm:pt-3 max-sm:pb-[max(env(safe-area-inset-bottom),0.75rem)] max-sm:backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}
