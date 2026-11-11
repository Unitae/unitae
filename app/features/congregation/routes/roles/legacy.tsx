import { redirect } from 'react-router'
import type { Route } from './+types/legacy'

const ORGANIGRAM = '/congregation/roles/organigram'
const ROLE_PAGE = /^\/congregation\/roles\/(\d+)\/(?:edit|delete)\/?$/
const TRAILING_SLASH = /\/$/

/** Where an address of the pages the organigram's panel and dialogs replaced leads now. */
export function organigramPathFor(pathname: string): string {
  if (pathname.replace(TRAILING_SLASH, '').endsWith('/organigram/adopt')) return `${ORGANIGRAM}?adopt=1`
  const role = ROLE_PAGE.exec(pathname)?.[1]
  if (role) return `${ORGANIGRAM}?role=${role}`
  return `${ORGANIGRAM}?new=1`
}

// New, edit, delete and « adopter le comité » were pages; they are the organigram's dialogs and panel now. Old links
// and bookmarks open them there.
export function loader({ request }: Route.LoaderArgs) {
  throw redirect(organigramPathFor(new URL(request.url).pathname))
}
