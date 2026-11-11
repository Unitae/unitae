// Where an address of Réglages from before its rebuild leads now, so bookmarks and links in old e-mails keep working.

const MOVED: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^\/settings\/congregation\/?$/, () => '/settings/publishers'],
  [/^\/settings\/congregation\/pioneer-goals\/?$/, () => '/settings/publishers'],
  [/^\/settings\/territories\/card-overlays\/?$/, () => '/settings/map'],
  [/^\/settings\/congregation\/templates(\/new)?\/?$/, () => '/settings/templates'],
  [/^\/settings\/congregation\/presets(\/.*)?$/, () => '/settings/part-types'],
  [
    /^\/settings\/congregation\/templates\/(\d+)(\/(edit|responsible))?\/?$/,
    match => `/settings/templates/${match[1]}`,
  ],
  [/^\/settings\/users\/(\d+)\/edit\/?$/, match => `/settings/users/${match[1]}`],
  [/^\/settings\/permissions\/?$/, () => '/settings/roles'],
  [/^\/settings\/data\/export\/([\w-]+)\/status\/?$/, match => `/settings/data?export=${match[1]}`],
  [/^\/settings\/data\/import\/([\w-]+)\/status\/?$/, match => `/settings/data?importJob=${match[1]}`],
  // The old confirmation page carried the archive's summary in its query: it is dropped, never passed on.
  [/^\/settings\/data\/(export|import)(\/confirm)?\/?$/, () => '/settings/data?'],
  [/^\/settings\/permissions\/(\d+)\/edit\/?$/, match => `/settings/roles?role=${match[1]}`],
]

/** The current address of an old settings address, or null when it is not one. */
export function currentSettingsPath(pathname: string): string | null {
  for (const [pattern, to] of MOVED) {
    const match = pathname.match(pattern)
    if (match) return to(match)
  }
  return null
}
