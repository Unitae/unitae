import { useSearchParams } from 'react-router'
import { AUDIT_ACTIONS, AUDIT_GROUP_LABEL, type AuditGroup } from '~/features/settings/model/audit-actions'
import { AUDIT_PERIODS, type AuditPeriod } from '~/features/settings/model/audit-period'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Input } from '~/shared/ui/input'
import { SearchInput } from '~/shared/ui/SearchInput'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/shared/ui/select'

const ALL = 'all'

const PERIOD_LABEL: Record<AuditPeriod, () => string> = {
  '7d': m.audit_log_period_7d,
  '30d': m.audit_log_period_30d,
  '3m': m.audit_log_period_3m,
  '12m': m.audit_log_period_12m,
  all: m.audit_log_period_all,
  custom: m.audit_log_period_custom,
}

const GROUPS = Object.keys(AUDIT_GROUP_LABEL) as AuditGroup[]

interface AuditLogToolbarProps {
  count: number
  period: AuditPeriod
  /** The days shown, to start chosen dates from. */
  from: string | undefined
  to: string | undefined
  today: string
}

/** Who, which action, which days: each choice is kept in the address and starts again from the first page. */
export function AuditLogToolbar({ count, period, from, to, today }: AuditLogToolbarProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const action = searchParams.get('action') ?? ALL
  const collator = new Intl.Collator(getLocale(), { sensitivity: 'base' })

  function update(changes: Record<string, string | null>) {
    setSearchParams(
      prev => {
        for (const [key, value] of Object.entries(changes)) {
          if (value == null) prev.delete(key)
          else prev.set(key, value)
        }
        prev.delete('page')
        return prev
      },
      { replace: true },
    )
  }

  function choosePeriod(next: string) {
    // Chosen dates start from the days already shown, so the list does not jump.
    if (next === 'custom') update({ period: next, from: from ?? today, to: to ?? today })
    else update({ period: next, from: null, to: null })
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="min-w-[200px] flex-[0_1_260px]">
        <SearchInput paramName="q" placeholder={m.audit_log_search()} />
      </div>
      <Select value={action} onValueChange={value => update({ action: value === ALL ? null : value })}>
        <SelectTrigger className="w-auto min-w-44" aria-label={m.audit_log_filter_action()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{m.audit_log_filter_all_actions()}</SelectItem>
          {GROUPS.map(group => (
            <SelectGroup key={group}>
              <SelectLabel>{AUDIT_GROUP_LABEL[group]()}</SelectLabel>
              {AUDIT_ACTIONS.filter(entry => entry.group === group)
                .map(entry => ({ action: entry.action, label: entry.label() }))
                .sort((a, b) => collator.compare(a.label, b.label))
                .map(entry => (
                  <SelectItem key={entry.action} value={entry.action}>
                    {entry.label}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Select value={period} onValueChange={choosePeriod}>
        <SelectTrigger className="w-auto min-w-40" aria-label={m.audit_log_period()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUDIT_PERIODS.map(each => (
            <SelectItem key={each} value={each}>
              {PERIOD_LABEL[each]()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label={m.audit_log_filter_from()}
            className="w-auto"
            key={`from-${from}`}
            defaultValue={from}
            max={today}
            onChange={event => event.target.value && update({ from: event.target.value })}
          />
          <span className="text-faint text-sm">–</span>
          <Input
            type="date"
            aria-label={m.audit_log_filter_to()}
            className="w-auto"
            key={`to-${to}`}
            defaultValue={to}
            max={today}
            onChange={event => event.target.value && update({ to: event.target.value })}
          />
        </div>
      )}
      <span className="ml-auto text-faint text-sm tabular-nums">
        {m.audit_log_count({ count: new Intl.NumberFormat(getLocale()).format(count) })}
      </span>
    </div>
  )
}
