// What a demo copy refuses (docs/development/specs/demo-mode.md): files, the login itself, inviting, and the
// congregation's archive. Everything else works, on invented data.

/** Changing a login, inviting someone or moving the congregation's data in or out. */
const REFUSED_PATHS = [
  /^\/me\/security\/?$/,
  /^\/settings\/users\/new\/?$/,
  /^\/settings\/users\/\d+\/?$/,
  /^\/settings\/users\/\d+\/(delete-account|reset-2fa|add-to-congregation)\/?$/,
  /^\/publishers\/\d+\/link-login\/?$/,
  /^\/settings\/data\/?$/,
]

/**
 * Whether a demo copy turns this request away: any submission carrying a file (board documents and their versions,
 * speaker lists, imports all send `multipart/form-data`), and the submissions to the paths above. Reading is never
 * refused.
 */
export function refusedInDemoCopy(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return false
  if (request.headers.get('Content-Type')?.startsWith('multipart/form-data')) return true
  const path = new URL(request.url).pathname
  return REFUSED_PATHS.some(pattern => pattern.test(path))
}
