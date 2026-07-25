import { useEffect, useState } from 'react'
import { Form } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'

export interface CalendarFeed {
  url: string
  lastUsedAt: string | Date | null
}

export function CalendarFeedCard({ calendar }: { calendar: CalendarFeed | null }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  async function handleCopy() {
    if (!calendar) return
    try {
      await navigator.clipboard.writeText(calendar.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.user_profile_calendar_section()}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{m.user_profile_calendar_description()}</p>

        {calendar == null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{m.user_profile_calendar_no_token()}</p>
            <Form method="post" action="/me/calendar-feed/regenerate">
              <SubmitButton className="w-fit">{m.user_profile_calendar_generate()}</SubmitButton>
            </Form>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="calendar-feed-url">{m.user_profile_calendar_url_label()}</Label>
              <div className="flex gap-2">
                <Input
                  id="calendar-feed-url"
                  type="text"
                  value={calendar.url}
                  readOnly
                  onFocus={event => event.currentTarget.select()}
                />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? m.user_profile_calendar_copied() : m.user_profile_calendar_copy()}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                {calendar.lastUsedAt
                  ? m.user_profile_calendar_last_used({ date: new Date(calendar.lastUsedAt).toLocaleString() })
                  : m.user_profile_calendar_never_used()}
              </p>
            </div>

            <p className="text-muted-foreground text-xs">{m.user_profile_calendar_help()}</p>

            <Alert variant="destructive">
              <AlertDescription>{m.user_profile_calendar_regenerate_warning()}</AlertDescription>
            </Alert>

            <div className="flex flex-wrap gap-2">
              <Form method="post" action="/me/calendar-feed/regenerate">
                <SubmitButton variant="outline" className="w-fit">
                  {m.user_profile_calendar_regenerate()}
                </SubmitButton>
              </Form>
              <Form method="post" action="/me/calendar-feed/revoke">
                <SubmitButton variant="destructive" className="w-fit">
                  {m.user_profile_calendar_revoke()}
                </SubmitButton>
              </Form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
