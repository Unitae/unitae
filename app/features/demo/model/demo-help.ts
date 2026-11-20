// What the in-app help says in a demo copy: an article whose task the copy refuses says so at its top, so a visitor
// following it isn't surprised by « Pas disponible dans la démo ». Client-safe: the article body draws the notice.

/**
 * `unavailable`: the copy refuses the task. Otherwise, what the copy refuses in it: an upload (`no-upload`), an upload
 * and a sending (`no-upload-no-send`), an account's page (`no-account-page`), or the e-mail (`no-email`).
 */
export type DemoHelpLimit = 'unavailable' | 'no-upload' | 'no-upload-no-send' | 'no-account-page' | 'no-email'

const LIMITS: Record<string, DemoHelpLimit> = {
  password: 'unavailable',
  'two-step-verification': 'unavailable',
  'reset-two-step': 'unavailable',
  'invite-user': 'unavailable',
  'congregation-data': 'unavailable',
  'board-add-pdf': 'unavailable',
  // A new version is an upload; the history reads.
  'board-versions': 'no-upload',
  // Received lists are uploads, and « Notre liste » is sent by e-mail; reading and editing work.
  'external-speakers': 'no-upload-no-send',
  // An account's page is refused; roles and their rights work.
  'give-rights': 'no-account-page',
  // The preferences save; a copy never sends the e-mail.
  notifications: 'no-email',
}

export function demoHelpLimit(slug: string): DemoHelpLimit | null {
  return LIMITS[slug] ?? null
}
