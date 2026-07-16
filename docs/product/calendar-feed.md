# Personal Calendar Feed

Every member can subscribe to their own programme assignments and absences from any standard calendar app — Apple Calendar, Google Calendar, Outlook, Fantastical, etc. — without keeping Unitae open. The feed is private to that member and updates automatically as assignments change.

## What's in the feed

- Programme part assignments where the member is the speaker or the reader
- Service role assignments where the member is the assignee
- Days off the member has recorded

Only assignments on [released](events.md#draft-and-released-events) events appear in the feed. An assignment on a draft event stays invisible until the programme manager publishes the event — at which point the calendar app picks it up on its next refresh.

The feed contains all future events plus events from the last three months. Anything older is dropped to keep calendar apps responsive.

## Subscribing

The link is generated and managed in **Profile → My calendar**:

1. Click *Generate link* the first time. Unitae creates a private URL.
2. Click *Copy* to put the URL on your clipboard.
3. Paste it into your calendar app:
   - **Apple Calendar** — File → New Calendar Subscription → paste the URL
   - **Google Calendar** — Other calendars → From URL → paste the URL
   - **Outlook** — Add calendar → Subscribe from web → paste the URL

Most calendar apps refresh subscribed feeds every few hours on their own — you don't need to do anything when assignments change.

## Privacy

The link contains a long random token. Anyone holding the URL can read your assignments and absences, so treat it like a personal password: don't post it publicly, don't share it, and use the regenerate / revoke options below if it leaks.

The feed is read-only — nobody can use it to change your data or impersonate you.

## Managing the link

From **Profile → My calendar**, you can:

- **Generate** — Create the link the first time you want to use the feed.
- **Copy** — Put the current URL on your clipboard.
- **Regenerate** — Replace the URL with a fresh one. Any calendar app subscribed to the old link stops receiving updates and needs to be re-subscribed with the new URL. Use this if the link has been accidentally shared.
- **Revoke** — Delete the link entirely. Subscribed calendar apps stop receiving updates. You can generate a new link later if you change your mind.

Regeneration and revocation are recorded in the audit log, so administrators can trace token activity if there's ever a concern.

## Permissions

Any member with an active account can use this feature for themselves — no special permission is required. The link is always personal: you can never see another member's feed.

## Related

- [Events](events.md) — How programme assignments and days off feed into the calendar
- [Security](security.md) — How tokens and personal data are protected
