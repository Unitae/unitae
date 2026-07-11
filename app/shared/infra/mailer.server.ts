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
