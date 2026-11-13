import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'

export interface StatLabelProps {
  label: string
  help: string
}

/** A figure's label and its help: a real button, so the explanation opens on keyboard focus as on hover. */
export function StatLabel({ label, help }: StatLabelProps) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
      {label}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={help}
              className="inline-grid size-5 place-content-center rounded-sm text-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="size-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            {help}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  )
}
