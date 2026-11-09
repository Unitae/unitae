import type { ReactNode } from 'react'

import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

interface RecordColumnsProps {
  /** What is followed over time: activity, pioneer service, programme, territories. */
  main: ReactNode
  /** What is looked up: contact details, congregation facts, follow-up, emergency info, login. */
  facts: ReactNode
  /** A panel is docked beside the record: one column instead of two. */
  stacked: boolean
  /** In one column, the facts come first: the block a panel edits stays in view. */
  factsFirst: boolean
  /** The docked panel, beside the columns. */
  panel?: ReactNode
}

/**
 * The record's two columns, the main one and the facts beside it. With a panel docked, the page becomes one column, as
 * the mockups have it, rather than three side by side.
 */
export function RecordColumns({ main, facts, stacked, factsFirst, panel }: RecordColumnsProps) {
  return (
    <div className="flex items-start gap-6">
      <div className={cn('flex min-w-0 flex-1 items-start gap-6', stacked ? 'flex-col items-stretch' : 'flex-wrap')}>
        <div className={cn('flex min-w-0 flex-col gap-5', stacked ? 'w-full' : 'flex-[999_1_540px]')}>{main}</div>
        <aside
          className={cn(
            'flex min-w-0 flex-col gap-4',
            stacked ? cn('w-full', factsFirst && 'order-first') : 'flex-[1_1_290px] lg:max-w-90',
          )}
          aria-label={m.publishers_record_facts()}
        >
          {facts}
        </aside>
      </div>
      {panel}
    </div>
  )
}
