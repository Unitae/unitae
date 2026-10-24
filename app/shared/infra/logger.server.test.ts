import { createHash } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { transports } from 'winston'
import { createLogger, redactObject, redactValue } from './logger.server'

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

describe('redactValue — Error stack', () => {
  // The stack's first line repeats the message, so redacting only the message logged the address anyway.
  it('redacts emails inside an Error stack too', () => {
    const result = redactValue('error', new Error('No account for marc@example.org')) as Record<string, unknown>

    expect(result.stack).not.toContain('marc@example.org')
    expect(result.stack).toContain('[email:')
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

// What reaches the log output, end to end: a logger whose only transport is an in-memory stream.
async function logOutput(meta: Record<string, unknown>): Promise<string> {
  const stream = new PassThrough()
  const chunks: Buffer[] = []
  stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
  const log = createLogger('test')
  log.clear().add(new transports.Stream({ stream }))
  log.info('snapshot', meta)
  await new Promise(resolve => setImmediate(resolve))
  return Buffer.concat(chunks).toString('utf8')
}

describe('log output of a full account snapshot', () => {
  // A route once logged `{ currentUser }`: the whole session account, linked member included.
  // Whatever a caller passes, secrets and personal fields must not reach the output in clear.
  const account = {
    id: 7,
    congregationId: 3,
    email: 'jeanne.martin@example.com',
    firstname: 'Jeanne',
    lastname: 'Martin',
    password: 'salt.scrypt-hash-value',
    twoFactorSecret: 'iv.ciphertext.tag-value',
    member: {
      id: 11,
      firstname: 'Jeanne',
      lastname: 'Martin',
      firstnameNormalized: 'jeanne',
      lastnameNormalized: 'martin',
      phone: '0611223344',
      address: '12 rue des Lilas, Lyon',
      notes: 'Visite le mardi',
    },
  }

  it('leaks none of its secrets or personal fields', async () => {
    const output = await logOutput({ currentUser: account, query: '12 rue des Lilas', ipAddress: '203.0.113.9' })

    for (const value of [
      'jeanne.martin@example.com',
      'Jeanne',
      'Martin',
      'jeanne',
      'martin',
      'salt.scrypt-hash-value',
      'iv.ciphertext.tag-value',
      '0611223344',
      'rue des Lilas',
      'Visite le mardi',
      '203.0.113.9',
    ]) {
      expect(output).not.toContain(value)
    }
  })

  it('keeps identifiers, so the entry stays useful', async () => {
    const output = JSON.parse(await logOutput({ currentUser: account }))

    expect(output.currentUser.id).toBe(7)
    expect(output.currentUser.member.id).toBe(11)
  })

  it('drops secrets entirely rather than hashing them', async () => {
    const output = JSON.parse(await logOutput({ currentUser: account }))

    expect(output.currentUser.password).toBe('[redacted]')
    expect(output.currentUser.twoFactorSecret).toBe('[redacted]')
  })
})
