import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { redactObject, redactValue } from './logger.server'

function expectedHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

describe('redactValue', () => {
  it('redacte les adresses email dans les chaines', () => {
    const result = redactValue('message', 'User login: user@example.com failed')
    expect(result).not.toContain('user@example.com')
    expect(result).toContain(`[email:${expectedHash('user@example.com')}]`)
  })

  it('redacte les champs PII par cle', () => {
    expect(redactValue('email', 'test@domain.com')).toBe(`[redacted:${expectedHash('test@domain.com')}]`)
    expect(redactValue('phone', '0600000000')).toBe(`[redacted:${expectedHash('0600000000')}]`)
    expect(redactValue('userEmail', 'a@b.com')).toBe(`[redacted:${expectedHash('a@b.com')}]`)
    expect(redactValue('address', '1 rue de la Paix')).toBe(`[redacted:${expectedHash('1 rue de la Paix')}]`)
  })

  it('ne redacte pas les champs non-PII', () => {
    expect(redactValue('congregationId', 5)).toBe(5)
    expect(redactValue('documentId', 10)).toBe(10)
    expect(redactValue('service', 'unitae-app')).toBe('unitae-app')
  })

  it('serializes an Error to name, message, and stack', () => {
    const result = redactValue('error', new TypeError('boom')) as Record<string, unknown>

    expect(result.name).toBe('TypeError')
    expect(result.message).toBe('boom')
    expect(typeof result.stack).toBe('string')
  })

  it('redacts emails inside an Error message', () => {
    const result = redactValue('error', new Error('failed for user@example.com')) as Record<string, unknown>

    expect(result.message).not.toContain('user@example.com')
    expect(result.message).toContain(`[email:${expectedHash('user@example.com')}]`)
  })
})

describe('redactObject', () => {
  it('redacte recursivement les champs PII dans un objet', () => {
    const result = redactObject({
      email: 'test@domain.com',
      userId: 42,
      phone: '0600000000',
      nested: { email: 'nested@test.com' },
    })

    expect(result.email).toBe(`[redacted:${expectedHash('test@domain.com')}]`)
    expect(result.userId).toBe(42)
    expect(result.phone).toBe(`[redacted:${expectedHash('0600000000')}]`)
    const nested = result.nested as Record<string, unknown>
    expect(nested.email).toBe(`[redacted:${expectedHash('nested@test.com')}]`)
  })

  it('preserves a nested Error instead of emptying it', () => {
    const result = redactObject({ error: new Error('kaboom'), status: 500 })

    const error = result.error as Record<string, unknown>
    expect(error.message).toBe('kaboom')
    expect(error.name).toBe('Error')
    expect(result.status).toBe(500)
  })
})
