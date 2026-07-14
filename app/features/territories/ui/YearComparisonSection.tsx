import { ChevronDown } from 'lucide-react'
import YearOverYearTable from '~/features/territories/ui/YearOverYearTable'
import { ZoneHeading } from '~/features/territories/ui/ZoneHeading'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/shared/ui/collapsible'

interface YearAggregate {
  coverage: number
  totalCoverage: number
  averageDurationDays: number
  overdueRate: number
  attributionCount: number
}

interface YearComparisonSectionProps {
  yearOverYear: { current: YearAggregate; previous: YearAggregate }
  theocraticYear: number
}

export default function YearComparisonSection({ yearOverYear, theocraticYear }: YearComparisonSectionProps) {
  const currentLabel = `${theocraticYear}/${theocraticYear + 1}`
  const previousLabel = `${theocraticYear - 1}/${theocraticYear}`

  return (
    <Collapsible defaultOpen>
      <div className="flex flex-col gap-3">
        <ZoneHeading eyebrow={m.stats_scope_theocratic_year()} title={m.stats_year_comparison_heading()} />
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="group flex cursor-pointer flex-row items-center justify-between gap-3">
              <CardTitle className="font-display text-lg">
                {m.stats_year_comparison_title({ current: currentLabel, previous: previousLabel })}
              </CardTitle>
              <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <YearOverYearTable
                current={yearOverYear.current}
                previous={yearOverYear.previous}
                currentLabel={currentLabel}
                previousLabel={previousLabel}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </div>
    </Collapsible>
  )
}
