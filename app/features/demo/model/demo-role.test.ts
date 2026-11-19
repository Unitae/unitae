import { describe, expect, it } from 'vitest'
import { registerLinkFromDemo } from './demo-role'

// The hosted site counts the congregations the demo brought from these two parameters.
describe('registerLinkFromDemo', () => {
  it('says the visitor comes from the demo, and as which role', () => {
    expect(registerLinkFromDemo('https://unitae.app/fr/register', 'territories')).toBe(
      'https://unitae.app/fr/register?from=demo&role=territories',
    )
  })

  it('keeps the parameters the link already had', () => {
    expect(registerLinkFromDemo('https://unitae.app/register?utm_source=app', 'secretary')).toBe(
      'https://unitae.app/register?utm_source=app&from=demo&role=secretary',
    )
  })

  it('leaves the role out when the visitor holds none of the demo’s', () => {
    expect(registerLinkFromDemo('https://unitae.app/register', null)).toBe('https://unitae.app/register?from=demo')
  })

  it('leaves a link it can’t read as it is', () => {
    expect(registerLinkFromDemo('/register', 'publisher')).toBe('/register')
  })
})
