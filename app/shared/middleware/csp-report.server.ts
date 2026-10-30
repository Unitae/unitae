import { createLogger } from '~/shared/infra/logger.server'

/**
 * Collector for the violation reports browsers POST to `CSP_REPORT_PATH` (see
 * `security-headers.server.ts`). Each report becomes one log line, so an operator can read what
 * the Report-Only policy would block before switching it to enforcement.
 *
 * The endpoint is public and unauthenticated, so everything in a report is treated as sender
 * input: the body is capped, URIs lose their query string and fragment (reset and invite tokens
 * travel there), every field is truncated, and the number of lines logged per minute is capped.
 */

// Real reports are around 500 bytes.
const MAX_BODY_BYTES = 8 * 1024
const MAX_URI_LENGTH = 256
const MAX_SAMPLE_LENGTH = 80
const WINDOW_MS = 60_000
const DEFAULT_LIMIT_PER_MINUTE = 100

const DIRECTIVE_NAME = /^[a-z-]{1,40}$/
// What browsers put in `blocked-uri` instead of a URL: 'inline', 'eval', 'wasm-eval', 'self'…
const URI_KEYWORD = /^[a-z-]{1,40}$/
// Violations caused by browser extensions injecting code: most of the volume, none of it ours.
const EXTENSION_SCHEME = /^(chrome|moz|ms-browser|safari|safari-web)-extension\b/
const QUERY_OR_FRAGMENT = /[?#].*$/s

type LogMeta = Record<string, string | number>
type LogFn = (message: string, meta: LogMeta) => void

interface CollectorOptions {
  log: LogFn
  now?: () => number
  limitPerMinute?: number
}

/** The URI without query string or fragment; `data:`/`blob:` and other non-web URIs keep their scheme only. */
function cleanUri(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  if (URI_KEYWORD.test(value)) return value
  let cleaned: string
  try {
    const url = new URL(value)
    cleaned = url.protocol === 'http:' || url.protocol === 'https:' ? `${url.origin}${url.pathname}` : url.protocol
  } catch {
    cleaned = value.replace(QUERY_OR_FRAGMENT, '')
  }
  return cleaned.slice(0, MAX_URI_LENGTH)
}

function integer(value: unknown): number | undefined {
  return Number.isInteger(value) ? (value as number) : undefined
}

function isFromExtension(report: Record<string, unknown>): boolean {
  return [report['blocked-uri'], report['source-file']].some(
    value => typeof value === 'string' && EXTENSION_SCHEME.test(value),
  )
}

/**
 * The log fields of a `{ "csp-report": {...} }` body, the format every browser sends to a
 * `report-uri` endpoint. `null` when the body is not a report; `'ignored'` for extension noise.
 */
function toLogMeta(body: unknown): LogMeta | 'ignored' | null {
  const report = (body as { 'csp-report'?: unknown } | null)?.['csp-report']
  if (report == null || typeof report !== 'object') return null
  const fields = report as Record<string, unknown>

  const directive = [fields['effective-directive'], fields['violated-directive']].find(
    value => typeof value === 'string' && value !== '',
  )
  if (typeof directive !== 'string' || !DIRECTIVE_NAME.test(directive)) return null
  if (isFromExtension(fields)) return 'ignored'

  const sample = typeof fields['script-sample'] === 'string' ? fields['script-sample'].slice(0, MAX_SAMPLE_LENGTH) : ''
  const disposition = fields.disposition === 'enforce' || fields.disposition === 'report' ? fields.disposition : ''
  const meta: Record<string, string | number | undefined> = {
    directive,
    blockedUri: cleanUri(fields['blocked-uri']),
    documentUri: cleanUri(fields['document-uri']),
    sourceFile: cleanUri(fields['source-file']),
    line: integer(fields['line-number']),
    column: integer(fields['column-number']),
    sample: sample || undefined,
    disposition: disposition || undefined,
  }
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined)) as LogMeta
}

/** The body as text, or `null` when it is (or declares itself) larger than `MAX_BODY_BYTES`. */
async function readCappedBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Builds the handler for the report endpoint. `log` receives one line per accepted report; past
 * `limitPerMinute` lines in a fixed one-minute window, further reports are dropped and a single
 * line says so, so a flood costs at most `limitPerMinute + 1` lines a minute.
 */
export function createCspReportCollector({
  log,
  now = Date.now,
  limitPerMinute = DEFAULT_LIMIT_PER_MINUTE,
}: CollectorOptions) {
  let windowStart = Number.NEGATIVE_INFINITY
  let seenInWindow = 0

  function admit(): boolean {
    const time = now()
    if (time - windowStart >= WINDOW_MS) {
      windowStart = time
      seenInWindow = 0
    }
    seenInWindow++
    if (seenInWindow === limitPerMinute + 1) {
      log('CSP violation reports over the limit, dropping the rest of this minute', { limitPerMinute })
    }
    return seenInWindow <= limitPerMinute
  }

  return async function collect(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })

    const text = await readCappedBody(request)
    if (text === null) return new Response(null, { status: 413 })

    const meta = toLogMeta(parseJson(text))
    if (meta === null) return new Response(null, { status: 400 })
    if (meta !== 'ignored' && admit()) log('CSP violation', meta)

    return new Response(null, { status: 204 })
  }
}

const logger = createLogger('csp-report')

export const collectCspReport = createCspReportCollector({ log: (message, meta) => logger.warn(message, meta) })
