import type { CreateEmailOptions, CreateEmailResponseSuccess } from 'resend'
import { Resend } from 'resend'

// Lazy so `new Resend(undefined)` — which throws — doesn't run at module
// load time in tests that pull this in transitively before mocks are set up.

let _instance: Resend | undefined

function getMailer(): Resend {
  if (!_instance) {
    _instance = new Resend(process.env.RESEND_API_KEY)
  }
  return _instance
}

export const mailer = new Proxy({} as Resend, {
  get(_target, prop, receiver) {
    return Reflect.get(getMailer(), prop, receiver)
  },
})

/** Whether this installation can send e-mail at all: a self-hosted one may run without a Resend key. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/**
 * Sends an email, throwing when Resend refuses it. Recipients at the demo's invented domains (below) are dropped first;
 * with no real recipient left it sends nothing and returns `null`.
 *
 * `mailer.emails.send` resolves on API-level rejections (unverified sending
 * domain, malformed `from`, rate limit) and reports them through the `error`
 * field rather than throwing. Callers that only `await` the promise therefore
 * read every rejection as a success. Always send through this wrapper so a
 * refusal reaches the caller's catch block — the notification worker relies on
 * a thrown error to mark the event `failed` and to trigger the BullMQ retry.
 */
export async function sendEmail(options: CreateEmailOptions): Promise<CreateEmailResponseSuccess | null> {
  const cc = options.cc === undefined ? [] : deliverable(options.cc)
  const bcc = options.bcc === undefined ? [] : deliverable(options.bcc)
  // The main recipient invented but a copy real (a coordinator in copy of a placeholder address): the copy becomes
  // the recipient, rather than losing a message the caller reports as sent.
  const listed = deliverable(options.to)
  const promoted = listed.length === 0
  const to = promoted ? cc : listed
  // Nobody real left (the demo's people and speakers): nothing to send.
  if (to.length === 0) return null
  const { data, error } = await mailer.emails.send({
    ...options,
    to,
    ...(options.cc === undefined ? {} : { cc: promoted ? [] : cc }),
    ...(options.bcc === undefined ? {} : { bcc }),
  } as CreateEmailOptions)

  if (error) {
    // ErrorResponse carries `message` in practice, but it is typed loosely
    // enough that a bare `name` can arrive — fall back so the throw is never
    // an empty string.
    throw new Error(error.message ?? error.name ?? 'Resend rejected the send')
  }

  return data
}

// The demo congregation's people live at demo.unitae.app and its visiting speakers at example.org (docs/development/
// specs/demo-mode.md): invented addresses, which would bounce and still cost sending quota. The example domains are
// reserved for documentation (RFC 2606) and never deliver anyway.
const INVENTED_DOMAINS = ['demo.unitae.app', 'example.org', 'example.com', 'example.net']
const NAMED_ADDRESS = /<([^>]+)>/

function deliverable(recipients: string | string[]): string[] {
  return (Array.isArray(recipients) ? recipients : [recipients]).filter(recipient => {
    // « Marc Dupont <marc@…> » as well as « marc@… ».
    const address = recipient.match(NAMED_ADDRESS)?.[1] ?? recipient
    const domain = address
      .slice(address.lastIndexOf('@') + 1)
      .trim()
      .toLowerCase()
    return !INVENTED_DOMAINS.includes(domain)
  })
}
