import { describe, expect, it } from 'vitest'
import { refusedInDemoCopy } from '~/features/demo/server/demo-guard.server'

function submit(path: string, init: RequestInit = {}) {
  return new Request(`https://demo-x7k2p.example.com${path}`, { method: 'POST', ...init })
}

describe('what a demo copy refuses', () => {
  it('refuses every file upload: board documents, versions, speaker lists, imports', () => {
    const body = new FormData()
    body.set('file', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }))
    expect(refusedInDemoCopy(submit('/board/documents/new', { body }))).toBe(true)
  })

  it('refuses changing the login itself, inviting, and the congregation’s archive', () => {
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
      expect(refusedInDemoCopy(submit(path, { body: new URLSearchParams({ intent: 'x' }) })), path).toBe(true)
    }
  })

  it('lets everything else through: assigning, reporting, attributing, reading', () => {
    expect(refusedInDemoCopy(submit('/programs/12', { body: new URLSearchParams({ intent: 'assign' }) }))).toBe(false)
    expect(refusedInDemoCopy(submit('/settings/users/412/export-data'))).toBe(false)
    expect(refusedInDemoCopy(new Request('https://demo-x7k2p.example.com/me/security'))).toBe(false)
  })
})
