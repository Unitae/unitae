// What a demo copy refuses (docs/development/specs/demo-mode.md): files, the login itself, inviting, and the
// congregation's archive. Everything else works, on invented data.

/** Changing, creating or removing a login, inviting someone, or moving the congregation's data in or out. */
const REFUSED_PATHS = [
  /^\/me\/security\/?$/,
  /^\/settings\/users\/new\/?$/,
  /^\/settings\/users\/\d+\/?$/,
  /^\/settings\/users\/\d+\/(delete-account|reset-2fa|add-to-congregation|anonymize)\/?$/,
  /^\/publishers\/\d+\/(link-login|unlink-login)\/?$/,
  /^\/password\/\d+\/invalidate\/?$/,
  /^\/settings\/data\/?$/,
]

// A page's JavaScript submits to the path's `.data` address (`/me/security.data`), which reaches the server as is.
const DATA_SUFFIX = /\.data$/
const REPEATED_SLASHES = /\/{2,}/g

/**
 * The path as the router matches it: escapes decoded, any case, slashes collapsed, without the `.data` suffix. Matching
 * the raw path would let `/ME/Security` or `/me%2Fsecurity` reach a page the guard means to refuse.
 */
function routedPath(request: Request): string {
  const raw = new URL(request.url).pathname
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  return decoded.toLowerCase().replace(REPEATED_SLASHES, '/').replace(DATA_SUFFIX, '')
}

/** Submissions refused by what they do, not by their path: the page posts several intents to one route. */
const REFUSED_INTENTS: { path: RegExp; intents: string[] }[] = [
  // « Notre liste » mails the addresses a visitor typed on the speaker congregations.
  { path: /^\/programs\/external-speakers\/ours\/?$/, intents: ['send'] },
]

/**
 * Whether a demo copy turns this request away: any submission carrying a file (board documents and their versions,
 * speaker lists and the archive import send a multipart body), the submissions to the paths above, and the intents
 * above, with or without JavaScript. Reading is never refused.
 */
export async function refusedInDemoCopy(request: Request): Promise<boolean> {
  if (request.method === 'GET' || request.method === 'HEAD') return false
  if (request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/')) return true
  const path = routedPath(request)
  if (REFUSED_PATHS.some(pattern => pattern.test(path))) return true
  const rule = REFUSED_INTENTS.find(each => each.path.test(path))
  if (!rule) return false
  // A clone: the route's action still reads the body.
  const intent = (await request.clone().formData()).get('intent')
  return typeof intent === 'string' && rule.intents.includes(intent)
}
