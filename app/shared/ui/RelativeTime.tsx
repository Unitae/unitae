import { formatAbsoluteDate, formatRelativeTime } from '~/shared/utils/relative-time'

interface RelativeTimeProps {
  date: Date | string
  locale?: string
}

export function RelativeTime({ date, locale = 'fr' }: RelativeTimeProps) {
  const target = date instanceof Date ? date : new Date(date)
  const relative = formatRelativeTime(target, locale)
  const absolute = formatAbsoluteDate(target, locale)

  return (
    <time dateTime={target.toISOString()} title={absolute}>
      {relative}
    </time>
  )
}
