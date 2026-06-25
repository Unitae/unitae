import { Resend } from 'resend'

// Lazy-initialized Resend client.
//
// Constructing `new Resend(undefined)` throws "Missing API key", which
// breaks ESM module loading in environments where RESEND_API_KEY isn't
// set at import time — most notably in test files that pull this module
// in transitively (e.g. via the `authentication` feature barrel) before
// vitest's mock setup has run.
//
// The Proxy preserves the existing `mailer.emails.send(...)` call shape
// for callers; the underlying client is only constructed on first
// property access.

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
