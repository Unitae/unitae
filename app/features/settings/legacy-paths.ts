// Where an address of Réglages from before its rebuild leads now, so bookmarks and links in old e-mails keep working.

const MOVED: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^\/settings\/congregation\/?$/, () => '/settings/publishers'],
  [/^\/settings\/congregation\/pioneer-goals\/?$/, () => '/settings/publishers'],
]

/** The current address of an old settings address, or null when it is not one. */
export function currentSettingsPath(pathname: string): string | null {
  for (const [pattern, to] of MOVED) {
    const match = pathname.match(pattern)
    if (match) return to(match)
  }
  return null
}
