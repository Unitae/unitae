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

/**
 * Sends an email, throwing when Resend refuses it.
 *
 * `mailer.emails.send` resolves on API-level rejections (unverified sending
 * domain, malformed `from`, rate limit) and reports them through the `error`
 * field rather than throwing. Callers that only `await` the promise therefore
 * read every rejection as a success. Always send through this wrapper so a
 * refusal reaches the caller's catch block — the notification worker relies on
 * a thrown error to mark the event `failed` and to trigger the BullMQ retry.
 */
export async function sendEmail(options: CreateEmailOptions): Promise<CreateEmailResponseSuccess | null> {
  const { data, error } = await mailer.emails.send(options)

  if (error) {
    // ErrorResponse carries `message` in practice, but it is typed loosely
    // enough that a bare `name` can arrive — fall back so the throw is never
    // an empty string.
    throw new Error(error.message ?? error.name ?? 'Resend rejected the send')
  }

  return data
}
