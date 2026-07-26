# Email Templates

## Overview

Unitae uses **React Email** for email templates and **Resend** as the delivery provider. Templates are React components (TSX) that render to HTML email, with all content driven by Paraglide i18n messages.

## File Structure

Email templates are colocated with the feature that triggers them — there is no centralized `app/emails/` directory.

```
app/features/
├── authentication/emails/
│   ├── reset-password.tsx                # Password reset link
│   ├── reset-password-required.tsx       # Forced password reset notification
│   └── verify-email.tsx                  # Email verification link
├── display-board/emails/
│   ├── new-document-in-board.tsx         # New document uploaded to board
│   ├── board-document-updated.tsx        # Existing document edited
│   ├── board-document-deleted.tsx        # Document removed
│   └── documents-expiring.tsx            # Documents approaching expiration
└── territories/emails/
    └── buildings-sync-done.tsx           # Open data sync completion
```

Notification templates live under the feature that owns the triggering domain
event (see [Notifications](notifications.md)). The `notifications` feature
itself holds only the pipeline — it does not ship any email templates.

The `pnpm start:emails` dev server is configured with `--dir app/features` (see `package.json`), so it finds templates anywhere under that tree.

## Template Pattern

Every template follows the same structure:

```tsx
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Tailwind, Text } from 'react-email'
import * as m from '~/i18n/paraglide/messages'

export default function TemplateName({
  email = 'test@email.com',
  firstname = 'Jean',
  baseUrl = 'https://unitae.app',
  platformName = 'Unitae',
}: {
  email: string
  firstname?: string
  baseUrl?: string
  platformName?: string
}) {
  return (
    <Html>
      <Head />
      <Preview>{m.email_template_preview()}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Heading>{m.email_heading()}</Heading>
            <Section>
              <Text>{m.email_greeting({ name: firstname ?? email })}</Text>
              <Text>{m.email_body()}</Text>
            </Section>
            <Hr />
            <Text className="text-[#666666] text-[12px]">{m.email_footer()}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
```

Key conventions:

- Default prop values enable preview rendering without real data
- All text uses `m.*()` Paraglide messages — never hardcode strings
- Styling uses Tailwind CSS via the `<Tailwind>` wrapper
- `<Preview>` sets the email preview text in inbox list views
- Common props: `email`, `firstname`, `baseUrl`, `platformName`

## How Emails Are Sent

Most notification emails go through the `notify()` pipeline (debounce, cancellation, role-based recipient resolution, user preferences). See [Notifications](notifications.md) for the full flow. Only truly one-off transactional emails — password reset, email verification — are sent inline via `mailer.emails.send()` from a service function.

The `notify()` pipeline path:

1. Business logic calls `notify()` from a service function:
   ```typescript
   await notify(db, {
     type: 'board.document.created',
     entityType: 'BoardDocument',
     entityId: document.id,
     congregationId,
     payload: { title: document.title, documentId: document.id },
   })
   ```

2. `notify()` either buffers a `NotificationEvent` in PostgreSQL (debounced) or enqueues a `notification-instant` job.

3. The worker picks up the job in `app/features/notifications/jobs/handle-email-work.server.tsx`, which delegates to `handle-notification-email.server.ts`.

4. `renderNotificationEmail` maps the notification type to a subject + React template, wrapped in `runWithLocale()` for i18n.

5. Resend renders the React component to HTML and delivers the email.

The inline path (`mailer.emails.send` directly from a service function) still exists for transactional emails such as password reset and email verification — but new notification work should go through `notify()`.

## Mailer Configuration

**File:** `app/shared/infra/mailer.server.ts`

The mailer is a Resend client initialized with `RESEND_API_KEY`. If the key is not set, email sending silently fails with a log message.

The sender address is per-congregation (`congregation.emailFrom`) with a fallback to `UNITAE_EMAIL_FROM` env var or `Unitae <noreply@unitae.app>`.

## Creating a New Email Template

For notifications (anything users may want to opt out of, or that groups well with other events), follow [Notifications → Adding a New Notification Type](notifications.md#adding-a-new-notification-type). It walks through registering the type, adding a payload schema, wiring the render case, and updating the preferences UI.

For purely transactional emails (password reset, email verification), skip the notification pipeline:

1. **Create the template** next to the feature that owns the trigger, under that feature's `emails/` directory — e.g. `app/features/territories/emails/my-new-email.tsx`. Don't add it to a centralized folder.
2. **Add i18n messages** for subject, body, etc. in `app/i18n/messages/en.json` and `app/i18n/messages/fr.json`.
3. **Call `mailer.emails.send()` directly** from a service function.

## Development Server

```bash
pnpm start:emails
```

This starts the React Email dev server (default: `http://localhost:3000`), which provides:

- Live preview of all templates with their default props
- Hot reload on template changes
- Useful for testing layout, styling, and responsive behavior

No actual emails are sent — the dev server only renders templates.

## Related

- [Notifications](notifications.md) — Notification-triggered email delivery
- [Background Processing](background-processing.md) — Email queue architecture
- [Internationalization](internationalization.md) — All email content uses Paraglide messages
