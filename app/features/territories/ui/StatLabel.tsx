import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'

export interface StatLabelProps {
  label: string
  help: string
}

export function StatLabel({ label, help }: StatLabelProps) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
      {label}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-3.5 cursor-help text-muted-foreground/60" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            {help}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  )
}
