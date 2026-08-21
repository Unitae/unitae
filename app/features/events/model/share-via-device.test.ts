import { describe, expect, it, vi } from 'vitest'
import { shareViaDevice } from './share-via-device'

function deps(overrides: Record<string, unknown> = {}) {
  return {
    share: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    onCopied: vi.fn(),
    onFailed: vi.fn(),
    ...overrides,
  }
}

function abort(name: string) {
  return new DOMException('dismissed', name)
}

describe('shareViaDevice', () => {
  it('uses the share sheet when the device has one', async () => {
    const d = deps()

    await shareViaDevice('message', d)

    expect(d.share).toHaveBeenCalledWith({ text: 'message' })
    expect(d.copy).not.toHaveBeenCalled()
  })

  it('never passes url or title — WhatsApp drops the body when url is set', async () => {
    const d = deps()

    await shareViaDevice('message', d)

    expect(Object.keys(d.share.mock.calls[0][0])).toEqual(['text'])
  })

  it('copies instead when the device has no share sheet', async () => {
    // Desktop Firefox, and any browser served over plain http.
    const d = deps({ share: undefined })

    await shareViaDevice('message', d)

    expect(d.copy).toHaveBeenCalledWith('message')
    expect(d.onCopied).toHaveBeenCalled()
  })

  it.each(['AbortError', 'NotAllowedError'])('stays silent when the user dismisses (%s)', async name => {
    // Closing the sheet is not a failure and must not raise a toast.
    const d = deps({ share: vi.fn().mockRejectedValue(abort(name)) })

    await shareViaDevice('message', d)

    expect(d.onFailed).not.toHaveBeenCalled()
    expect(d.onCopied).not.toHaveBeenCalled()
  })

  it('recognises a dismissal from another realm', async () => {
    // An error raised inside an iframe is a DOMException from a different
    // realm, so `instanceof` would miss it and we would toast at a user who
    // simply closed the sheet.
    const foreign = { name: 'AbortError', message: 'dismissed' }
    const d = deps({ share: vi.fn().mockRejectedValue(foreign) })

    await shareViaDevice('message', d)

    expect(d.onFailed).not.toHaveBeenCalled()
  })

  it('reports a genuine share failure', async () => {
    const d = deps({ share: vi.fn().mockRejectedValue(new Error('boom')) })

    await shareViaDevice('message', d)

    expect(d.onFailed).toHaveBeenCalled()
  })

  it('reports a clipboard failure rather than looking like it worked', async () => {
    const d = deps({ share: undefined, copy: vi.fn().mockRejectedValue(new Error('denied')) })

    await shareViaDevice('message', d)

    expect(d.onFailed).toHaveBeenCalled()
    expect(d.onCopied).not.toHaveBeenCalled()
  })

  it('calls share before yielding, so the user activation is still valid', () => {
    // navigator.share requires transient activation; any await before it spends
    // that activation and Safari rejects with NotAllowedError. Not awaited here
    // on purpose — share must already have been called by the time this returns.
    const d = deps()

    shareViaDevice('message', d)

    expect(d.share).toHaveBeenCalledTimes(1)
  })
})
