import YearOverYearTable from '~/features/territories/ui/YearOverYearTable'
import { ZoneHeading } from '~/features/territories/ui/ZoneHeading'
import * as m from '~/i18n/paraglide/messages'

interface YearAggregate {
  coverage: number
  totalCoverage: number
  averageDurationDays: number | null
  overdueRate: number | null
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
    <section className="flex flex-col gap-3">
      <ZoneHeading
        eyebrow={m.stats_scope_theocratic_year()}
        title={m.stats_year_comparison_title({ current: currentLabel, previous: previousLabel })}
      />
      <YearOverYearTable
        current={yearOverYear.current}
        previous={yearOverYear.previous}
        currentLabel={currentLabel}
        previousLabel={previousLabel}
      />
    </section>
  )
}
