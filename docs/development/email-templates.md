# Email Templates

## Overview

Unitae uses **React Email** for email templates and **Resend** as the delivery provider. Templates are React components (TSX) that render to HTML email, with all content driven by Paraglide i18n messages.

## File Structure

```
app/emails/
├── reset-password.tsx                    # Password reset link
├── reset-password-required.tsx           # Forced password reset notification
├── verify-email.tsx                      # Email verification link
└── notifications/
    ├── new-document-in-board.tsx          # New document uploaded to board
    ├── documents-expiring.tsx            # Documents approaching expiration
    └── buildings-sync-done.tsx           # Territory sync completion
```

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

1. Business logic adds a job to the email queue:
   ```typescript
   emailQueue.add('new-document-notification', { congregationId, documentId })
   ```

2. The worker picks up the job in `app/shared/infra/handle-email-work.server.tsx`

3. The handler wraps rendering in `runWithLocale()` for correct i18n:
   ```typescript
   await runWithLocale(congregation.locale, async () => {
     await mailer.emails.send({
       to: user.email,
       from: congregation.emailFrom,
       subject: m.email_subject(),
       react: <TemplateComponent email={user.email} ... />,
     })
   })
   ```

4. Resend renders the React component to HTML and delivers the email.

## Mailer Configuration

**File:** `app/shared/infra/mailer.server.ts`

The mailer is a Resend client initialized with `RESEND_API_KEY`. If the key is not set, email sending silently fails with a log message.

The sender address is per-congregation (`congregation.emailFrom`) with a fallback to `UNITAE_EMAIL_FROM` env var or `Unitae <noreply@unitae.app>`.

## Creating a New Email Template

1. **Create the template** in `app/emails/` (or `app/emails/notifications/` for notification emails):
   ```bash
   app/emails/notifications/my-new-email.tsx
   ```

2. **Add i18n messages** for subject, body, etc. in `app/i18n/messages/en.json` and `app/i18n/messages/fr.json`

3. **Add the job type** to `EmailJobData` in `app/shared/infra/email-queue.server.ts`:
   ```typescript
   | { type: 'my-new-email'; congregationId: number; myField: string }
   ```

4. **Add the handler case** in `app/shared/infra/handle-email-work.server.tsx`:
   ```typescript
   case 'my-new-email':
     return handleMyNewEmail(job.data)
   ```

5. **Queue jobs** from business logic:
   ```typescript
   import { emailQueue } from '~/shared/infra/email-queue.server'
   await emailQueue.add('my-new-email', { congregationId, myField: 'value' })
   ```

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
