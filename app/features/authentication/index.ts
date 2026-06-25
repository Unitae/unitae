// Public surface of the authentication feature.
//
// Other features import session helpers, password-reset triggers, and
// related primitives through this barrel. Direct imports into
// `./server/*` or `./emails/*` from outside the feature are blocked by
// the cross-feature boundary lint rule
// (eslint.config.js → boundaries/dependencies).
//
// Add an export here only when another feature actually deep-imports
// the symbol today. Don't speculate.

export { default as ResetPasswordRequired } from './emails/reset-password-required'
export { findUserByCalendarFeedToken, touchCalendarFeedToken } from './server/calendar-feed-token.server'
export { createPasswordResetToken } from './server/invalidate-account-password.server'
export { sendResetAccountPasswordEmail } from './server/send-reset-account-password-email.server'
export { commitSession, getSession } from './server/session.server'
