import { describe, expect, it } from 'vitest'
import { refusedInDemoCopy } from '~/features/demo/server/demo-guard.server'

function submit(path: string, init: RequestInit = {}) {
  return new Request(`https://demo-x7k2p.example.com${path}`, { method: 'POST', ...init })
}

describe('what a demo copy refuses', () => {
  it('refuses every file upload: board documents, versions, speaker lists, imports', async () => {
    const body = new FormData()
    body.set('file', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }))
    expect(await refusedInDemoCopy(submit('/board/documents/new', { body }))).toBe(true)
    // Any multipart body, whatever its case: the upload parser accepts them all.
    const mixed = submit('/board/documents/new', {
      headers: { 'Content-Type': 'Multipart/Mixed; boundary=x' },
      body: 'x',
    })
    expect(await refusedInDemoCopy(mixed)).toBe(true)
  })

  it('refuses changing the login itself, inviting, and the congregation’s archive', async () => {
    for (const path of [
      '/me/security',
      '/settings/users/new',
      '/settings/users/412',
      '/settings/users/412/delete-account',
      '/settings/users/412/reset-2fa',
      '/settings/users/412/add-to-congregation',
      '/publishers/18/link-login',
      '/settings/data',
    ]) {
      expect(await refusedInDemoCopy(submit(path, { body: new URLSearchParams({ intent: 'x' }) })), path).toBe(true)
    }
  })

  it('refuses them the same when the page submits them with JavaScript, to the path’s .data address', async () => {
    for (const path of ['/me/security.data', '/settings/users/412.data', '/settings/data.data']) {
      expect(await refusedInDemoCopy(submit(path, { body: new URLSearchParams({ intent: 'x' }) })), path).toBe(true)
    }
  })

  it('refuses a path written otherwise that the router still matches: case, escapes, doubled slashes', async () => {
    for (const path of ['/ME/Security', '/me%2Fsecurity', '//settings//users/new', '/Settings/Data.data']) {
      expect(await refusedInDemoCopy(submit(path, { body: new URLSearchParams({ intent: 'x' }) })), path).toBe(true)
    }
  })

  it('refuses the actions that would take a role’s own login away', async () => {
    for (const path of ['/settings/users/412/anonymize', '/publishers/18/unlink-login', '/password/412/invalidate']) {
      expect(await refusedInDemoCopy(submit(path, { body: new URLSearchParams({ intent: 'x' }) })), path).toBe(true)
    }
  })

  it('refuses sending « Notre liste », which would mail the addresses a visitor typed', async () => {
    const send = submit('/programs/external-speakers/ours.data', { body: new URLSearchParams({ intent: 'send' }) })
    expect(await refusedInDemoCopy(send)).toBe(true)
    const save = submit('/programs/external-speakers/ours', { body: new URLSearchParams({ intent: 'save-talks' }) })
    expect(await refusedInDemoCopy(save)).toBe(false)
  })

  it('lets everything else through: assigning, reporting, attributing, reading', async () => {
    expect(await refusedInDemoCopy(submit('/programs/12', { body: new URLSearchParams({ intent: 'assign' }) }))).toBe(
      false,
    )
    expect(await refusedInDemoCopy(submit('/settings/users/412/export-data'))).toBe(false)
    expect(await refusedInDemoCopy(new Request('https://demo-x7k2p.example.com/me/security'))).toBe(false)
  })
})
