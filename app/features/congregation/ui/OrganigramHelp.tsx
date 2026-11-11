import { ChevronDown } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/shared/ui/collapsible'

// What a box is, who names whom, and where permissions are set: simple once stated, but nothing on the chart states
// it. One quiet line, open on an empty chart where the ideas must come before the first role.

export function OrganigramHelp({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="text-sm">
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground focus-visible:ring-ring flex items-center gap-1.5 outline-none focus-visible:ring-2">
        <ChevronDown
          aria-hidden="true"
          className="text-faint size-4 transition-transform group-data-[state=closed]:-rotate-90"
        />
        {m.org_help_title()}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="text-muted-foreground max-w-prose pt-2 pl-5.5 leading-relaxed">{m.org_help_body()}</p>
      </CollapsibleContent>
    </Collapsible>
  )
}
