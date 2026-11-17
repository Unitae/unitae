import type { HelpLocale } from '~/features/help/model/help.type'

/** One capture of the app, as the capture script measured it: its size in CSS pixels and the day it was taken. */
export interface HelpCapture {
  width: number
  height: number
  /** `YYYY-MM-DD`. Also the cache key of its address, so a retaken capture is never served stale. */
  captured: string
}

/** Every capture, per language: a capture shows the demo congregation in that language. Written by the script. */
export type HelpCaptureManifest = Record<HelpLocale, Record<string, HelpCapture>>

/** An article shows a capture as `![what it shows](capture:<id>)`; no other image source is drawn. */
export const HELP_CAPTURE_SCHEME = 'capture:'

const IMAGE = /!\[([^\]]*)\]\(([^)\s]*)\)/g

/** The images of a Markdown body, in order: what the loader checks before an article can ship. */
export function helpImagesIn(body: string): { alt: string; src: string }[] {
  return [...body.matchAll(IMAGE)].map(([, alt, src]) => ({ alt, src }))
}

/** The body with each image reduced to its description: the search reads that, never a capture's source. */
export function withoutImageSources(body: string): string {
  return body.replace(IMAGE, '$1')
}

/**
 * Where a capture is served from: `public/help-captures/<locale>/<id>.webp`, `<id>.dark.webp` for the dark theme.
 * Outside `/help`, so no route ever answers for it.
 */
export function helpCaptureUrl(locale: HelpLocale, id: string, theme: 'light' | 'dark', captured: string): string {
  return `/help-captures/${locale}/${id}${theme === 'dark' ? '.dark' : ''}.webp?v=${captured}`
}
