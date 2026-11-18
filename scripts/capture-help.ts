/**
 * Takes every in-app help shot from `scripts/help-captures/shots.ts` in every supported help locale, in the light and
 * dark themes, at twice the pixel density, framed on what the article's step names. It writes
 * `public/help-captures/<locale>/<id>.webp` and `<id>.dark.webp`, and records each capture's size and date in
 * `app/features/help/content/captures.json`.
 *
 *   HELP_CAPTURE_PASSWORD=… pnpm build:help-captures [--locale fr] [--only a,b] [--raw <dir>]
 *
 * It drives one running app per locale whose database holds the demo congregation: the steps are in
 * `scripts/help-captures/README.md`. Never point it at a database you care about. `--only` retakes some captures and
 * leaves the others as they are: the demo is dated from today, so a full run changes every file. `--raw` also keeps
 * each whole page in a folder, to frame a new shot.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type Browser, chromium, type Locator, type Page } from '@playwright/test'
import { HELP_LOCALES, type HelpLocale } from '~/features/help/model/help.type'
import type { HelpCaptureManifest } from '~/features/help/model/help-captures'
import { HELP_SHOTS, type HelpShot } from './help-captures/shots'

const ROOT = resolve(import.meta.dirname, '..')
const MANIFEST = resolve(ROOT, 'app/features/help/content/captures.json')
const THEMES = ['light', 'dark'] as const
const VIEWPORT = { width: 1280, height: 800 }

function viewportOf(shot: HelpShot) {
  return { ...VIEWPORT, ...shot.viewport }
}
const DENSITY = 2
const WEBP_QUALITY = 0.9
const SETTLE_TIMEOUT = 10_000

const APP_URLS: Record<HelpLocale, string> = {
  fr: process.env.HELP_CAPTURE_URL_FR ?? 'http://127.0.0.1:5182',
  en: process.env.HELP_CAPTURE_URL_EN ?? 'http://127.0.0.1:5183',
  'pt-PT': process.env.HELP_CAPTURE_URL_PT_PT ?? 'http://127.0.0.1:5184',
}

interface Options {
  locales: HelpLocale[]
  shots: HelpShot[]
  password: string
  /** Where to also keep each whole screen, to frame a new shot. */
  raw?: string
}

function readOptions(argv: string[]): Options {
  const value = (flag: string) => {
    const index = argv.indexOf(flag)
    return index === -1 ? undefined : argv[index + 1]
  }
  const password = process.env.HELP_CAPTURE_PASSWORD
  if (!password) throw new Error('Set HELP_CAPTURE_PASSWORD to the demo accounts’ password.')

  const locale = value('--locale')
  if (locale != null && !(HELP_LOCALES as readonly string[]).includes(locale))
    throw new Error(`Unknown locale ${locale}.`)
  const only = value('--only')?.split(',')
  const unknown = only?.filter(id => !HELP_SHOTS.some(shot => shot.id === id)) ?? []
  if (unknown.length > 0) throw new Error(`Unknown capture ids: ${unknown.join(', ')}.`)

  return {
    locales: locale == null ? [...HELP_LOCALES] : [locale as HelpLocale],
    shots: only == null ? HELP_SHOTS : HELP_SHOTS.filter(shot => only.includes(shot.id)),
    password,
    raw: value('--raw'),
  }
}

/**
 * Waits for the page's requests to settle, but never on `load`: a page whose map tiles never answer (an instance
 * without a base map) would hold it forever. A page that keeps polling is captured after the wait.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT }).catch(() => undefined)
}

async function signIn(page: Page, baseUrl: string, email: string, password: string): Promise<void> {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/login'), { waitUntil: 'commit' }),
    page.press('input[name="password"]', 'Enter'),
  ])
}

/** Re-encodes a PNG as WebP in the browser itself, so the script needs no image library. */
async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ data, quality }) => {
      const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
      const buffer = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (const byte of buffer) binary += String.fromCharCode(byte)
      return btoa(binary)
    },
    { data: png.toString('base64'), quality: WEBP_QUALITY },
  )
  return Buffer.from(base64, 'base64')
}

async function boxesOf(shot: HelpShot, locators: Locator[]) {
  const boxes = []
  for (const locator of locators) {
    const box = await locator.boundingBox()
    if (box == null) throw new Error(`${shot.id}: an element to frame has no box.`)
    boxes.push(box)
  }
  return boxes
}

/** Below the sticky 48 px top bar, with room to spare. */
const TOP_CLEARANCE = 72

/** The box around the shot's elements, scrolled to start just under the top bar, inside the viewport. */
async function frameOf(page: Page, shot: HelpShot, locale: HelpLocale) {
  const locators = shot.frame(page, locale)
  for (const locator of locators) await locator.waitFor({ state: 'visible' })
  const top = Math.min(...(await boxesOf(shot, locators)).map(box => box.y))
  if (top > TOP_CLEARANCE) {
    await page.evaluate(by => window.scrollBy(0, by), top - TOP_CLEARANCE)
  }
  const boxes = await boxesOf(shot, locators)
  const margin = shot.margin ?? 16
  const x = Math.max(0, Math.floor(Math.min(...boxes.map(box => box.x)) - margin))
  const y = Math.max(0, Math.floor(Math.min(...boxes.map(box => box.y)) - margin))
  const viewport = viewportOf(shot)
  const right = Math.min(viewport.width, Math.ceil(Math.max(...boxes.map(box => box.x + box.width)) + margin))
  const bottom = Math.min(viewport.height, Math.ceil(Math.max(...boxes.map(box => box.y + box.height)) + margin))
  if (right <= x || bottom <= y) throw new Error(`${shot.id}: the frame falls outside the screen.`)
  return { x, y, width: right - x, height: bottom - y }
}

async function capture(browser: Browser, locale: HelpLocale, shot: HelpShot, options: Options) {
  const sizes = []
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: viewportOf(shot),
      deviceScaleFactor: DENSITY,
      colorScheme: theme,
      reducedMotion: 'reduce',
      locale,
      timezoneId: 'Europe/Paris',
    })
    const page = await context.newPage()
    await signIn(page, APP_URLS[locale], shot.account, options.password)
    await page.goto(`${APP_URLS[locale]}${shot.path}`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await shot.prepare?.(page, locale)
    await page.evaluate(() => document.fonts.ready)
    if (options.raw != null) {
      mkdirSync(options.raw, { recursive: true })
      await page.screenshot({ path: resolve(options.raw, `${locale}-${shot.id}-${theme}.png`), fullPage: true })
    }
    const clip = await frameOf(page, shot, locale)
    const webp = await toWebp(page, await page.screenshot({ clip }))
    const file = `${shot.id}${theme === 'dark' ? '.dark' : ''}.webp`
    writeFileSync(resolve(ROOT, 'public/help-captures', locale, file), webp)
    sizes.push({ theme, width: clip.width, height: clip.height, bytes: webp.length })
    await context.close()
  }
  const report = sizes.map(s => `${s.theme} ${s.width}×${s.height} ${Math.round(s.bytes / 1024)} kB`).join(', ')
  // biome-ignore lint/suspicious/noConsole: a local script that reports what it wrote
  console.log(`${locale}/${shot.id}: ${report}`)
  return sizes[0]
}

async function main() {
  const options = readOptions(process.argv.slice(2))
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as HelpCaptureManifest
  const today = new Date().toISOString().slice(0, 10)
  const browser = await chromium.launch()
  try {
    for (const locale of options.locales) {
      for (const shot of options.shots) {
        const { width, height } = await capture(browser, locale, shot, options)
        manifest[locale][shot.id] = { width, height, captured: today }
      }
    }
  } finally {
    await browser.close()
  }
  const sorted = Object.fromEntries(
    HELP_LOCALES.map(locale => [
      locale,
      Object.fromEntries(Object.entries(manifest[locale]).sort(([a], [b]) => a.localeCompare(b))),
    ]),
  )
  // Four spaces, as Biome formats the repository's JSON.
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 4)}\n`)
}

await main()
