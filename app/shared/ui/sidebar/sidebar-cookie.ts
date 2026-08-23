// The sidebar provider persists its open state in a plain cookie (see
// sidebar-context.tsx). Only an explicit `sidebar_state=false` collapses the
// sidebar on load — anything else (no cookie, malformed value) keeps the
// default open state.
const SIDEBAR_COOKIE_CLOSED_RE = /(?:^|;\s*)sidebar_state=false(?:\s*;|$)/

/** Initial sidebar open state from a request's Cookie header. */
export function readSidebarOpenFromCookie(cookieHeader: string | null): boolean {
  return !SIDEBAR_COOKIE_CLOSED_RE.test(cookieHeader ?? '')
}
