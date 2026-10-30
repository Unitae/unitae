import { describe, expect, it } from 'vitest'

import { createCspReportCollector } from '~/shared/middleware/csp-report.server'

interface LogEntry {
  message: string
  meta: Record<string, string | number>
}

function collector(options: { now?: () => number; limitPerMinute?: number } = {}) {
  const entries: LogEntry[] = []
  const collect = createCspReportCollector({ log: (message, meta) => entries.push({ message, meta }), ...options })
  return { collect, entries }
}

function reportRequest(report: unknown, init: RequestInit = {}) {
  return new Request('https://congA.unitae.app/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body: typeof report === 'string' ? report : JSON.stringify(report),
    ...init,
  })
}

// The shape Chromium, Firefox and Safari POST to a `report-uri` endpoint.
function legacyReport(overrides: Record<string, unknown> = {}) {
  return {
    'csp-report': {
      'document-uri': 'https://congA.unitae.app/territories',
      referrer: '',
      'violated-directive': 'script-src-elem',
      'effective-directive': 'script-src-elem',
      'original-policy': "default-src 'self'; report-uri /csp-report",
      disposition: 'report',
      'blocked-uri': 'https://cdn.example.test/widget.js',
      'line-number': 12,
      'column-number': 4,
      'source-file': 'https://congA.unitae.app/territories',
      'status-code': 200,
      'script-sample': '',
      ...overrides,
    },
  }
}

describe('createCspReportCollector', () => {
  it('logs the violation a browser reports and answers 204', async () => {
    const { collect, entries } = collector()

    const response = await collect(reportRequest(legacyReport()))

    expect(response.status).toBe(204)
    expect(entries).toEqual([
      {
        message: 'CSP violation',
        meta: {
          directive: 'script-src-elem',
          blockedUri: 'https://cdn.example.test/widget.js',
          documentUri: 'https://conga.unitae.app/territories',
          sourceFile: 'https://conga.unitae.app/territories',
          line: 12,
          column: 4,
          disposition: 'report',
        },
      },
    ])
  })

  it('drops the query string and fragment of every URI, where tokens travel', async () => {
    const { collect, entries } = collector()

    await collect(
      reportRequest(
        legacyReport({
          'document-uri': 'https://congA.unitae.app/password/reset?token=s3cr3t#step',
          'blocked-uri': 'https://cdn.example.test/w.js?key=abc',
          'source-file': 'https://congA.unitae.app/assets/app.js?v=1',
        }),
      ),
    )

    expect(entries[0].meta).toMatchObject({
      documentUri: 'https://conga.unitae.app/password/reset',
      blockedUri: 'https://cdn.example.test/w.js',
      sourceFile: 'https://conga.unitae.app/assets/app.js',
    })
    expect(JSON.stringify(entries)).not.toContain('s3cr3t')
  })

  it('keeps the keywords browsers use for inline code and eval', async () => {
    const { collect, entries } = collector()

    await collect(reportRequest(legacyReport({ 'blocked-uri': 'inline' })))
    await collect(reportRequest(legacyReport({ 'blocked-uri': 'eval', 'effective-directive': 'script-src' })))

    expect(entries.map(entry => entry.meta.blockedUri)).toEqual(['inline', 'eval'])
  })

  it('reduces data: and blob: URIs to their scheme', async () => {
    const { collect, entries } = collector()

    await collect(reportRequest(legacyReport({ 'blocked-uri': 'data:image/png;base64,iVBORw0KGgo=' })))
    await collect(reportRequest(legacyReport({ 'blocked-uri': 'blob:https://congA.unitae.app/1f2e' })))

    expect(entries.map(entry => entry.meta.blockedUri)).toEqual(['data:', 'blob:'])
  })

  it('keeps a short script sample and drops an empty one', async () => {
    const { collect, entries } = collector()

    await collect(reportRequest(legacyReport({ 'blocked-uri': 'inline', 'script-sample': 'alert(1)' })))
    await collect(reportRequest(legacyReport({ 'blocked-uri': 'inline', 'script-sample': '' })))

    expect(entries[0].meta.sample).toBe('alert(1)')
    expect(entries[1].meta).not.toHaveProperty('sample')
  })

  it('falls back to the violated directive when the effective one is missing', async () => {
    const { collect, entries } = collector()

    await collect(reportRequest(legacyReport({ 'effective-directive': undefined, 'violated-directive': 'img-src' })))

    expect(entries[0].meta.directive).toBe('img-src')
  })

  it.each([
    ['blocked-uri', 'chrome-extension://abcdef/content.js'],
    ['blocked-uri', 'moz-extension'],
    ['source-file', 'safari-web-extension://1234/script.js'],
  ])('ignores violations a browser extension caused (%s %s)', async (field, value) => {
    const { collect, entries } = collector()

    const response = await collect(reportRequest(legacyReport({ [field]: value })))

    expect(response.status).toBe(204)
    expect(entries).toEqual([])
  })

  it('truncates the fields a sender controls', async () => {
    const { collect, entries } = collector()

    await collect(
      reportRequest(
        legacyReport({
          'blocked-uri': `https://cdn.example.test/${'a'.repeat(3000)}`,
          'script-sample': 'x'.repeat(500),
        }),
      ),
    )

    expect(String(entries[0].meta.blockedUri).length).toBeLessThanOrEqual(256)
    expect(String(entries[0].meta.sample).length).toBeLessThanOrEqual(80)
  })

  it('ignores fields of the wrong type instead of logging them', async () => {
    const { collect, entries } = collector()

    await collect(
      reportRequest(legacyReport({ 'blocked-uri': { nested: true }, 'line-number': '12', disposition: 'whatever' })),
    )

    expect(entries[0].meta).not.toHaveProperty('blockedUri')
    expect(entries[0].meta).not.toHaveProperty('line')
    expect(entries[0].meta).not.toHaveProperty('disposition')
  })

  it.each([
    ['a body that is not JSON', 'not json'],
    ['JSON without a csp-report', JSON.stringify({ hello: 'world' })],
    ['a report without a directive', JSON.stringify({ 'csp-report': { 'blocked-uri': 'inline' } })],
    [
      'a report whose directive is not a directive name',
      JSON.stringify(legacyReport({ 'effective-directive': '<b>' })),
    ],
  ])('rejects %s with 400 and logs nothing', async (_label, body) => {
    const { collect, entries } = collector()

    const response = await collect(reportRequest(body))

    expect(response.status).toBe(400)
    expect(entries).toEqual([])
  })

  it('rejects a body over 8 KiB with 413 without logging it', async () => {
    const { collect, entries } = collector()
    const oversized = JSON.stringify(legacyReport({ 'script-sample': 'x'.repeat(9000) }))

    const response = await collect(reportRequest(oversized))

    expect(response.status).toBe(413)
    expect(entries).toEqual([])
  })

  it('rejects a declared Content-Length over 8 KiB before reading the body', async () => {
    const { collect, entries } = collector()

    const response = await collect(
      reportRequest(legacyReport(), {
        headers: { 'content-type': 'application/csp-report', 'content-length': '100000' },
      }),
    )

    expect(response.status).toBe(413)
    expect(entries).toEqual([])
  })

  it('answers 405 to anything but POST', async () => {
    const { collect } = collector()

    const response = await collect(new Request('https://congA.unitae.app/csp-report', { method: 'PUT', body: '{}' }))

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
  })

  it('logs at most the per-minute limit, says once that it is dropping, and resumes the next minute', async () => {
    let clock = 0
    const { collect, entries } = collector({ now: () => clock, limitPerMinute: 2 })

    for (let i = 0; i < 4; i++) await collect(reportRequest(legacyReport()))
    clock = 60_000
    await collect(reportRequest(legacyReport()))

    expect(entries.map(entry => entry.message)).toEqual([
      'CSP violation',
      'CSP violation',
      'CSP violation reports over the limit, dropping the rest of this minute',
      'CSP violation',
    ])
    expect(entries[2].meta).toEqual({ limitPerMinute: 2 })
  })
})
