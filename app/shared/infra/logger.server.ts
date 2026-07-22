import { createHash } from 'node:crypto'
import { createLogger as createWinstonLogger, format, transports } from 'winston'

const { combine, json, errors, timestamp } = format

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PII_KEYS = new Set([
  'email',
  'userEmail',
  'phone',
  'address',
  'firstname',
  'lastname',
  'birthDate',
  'baptismDate',
])

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function redactValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    if (PII_KEYS.has(key)) {
      return `[redacted:${hashValue(value)}]`
    }
    return value.replace(EMAIL_PATTERN, match => `[email:${hashValue(match)}]`)
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => redactValue(String(i), item))
  }
  if (value instanceof Error) {
    // An Error's `message`/`stack` are non-enumerable, so the generic object branch below
    // (which iterates `Object.entries`) would serialize it to `{}` and lose everything.
    // Extract them explicitly so `logger.error('...', { error })` stays useful.
    return {
      name: value.name,
      message: redactValue('message', value.message),
      stack: value.stack,
    }
  }
  if (value != null && typeof value === 'object') {
    return redactObject(value as Record<string, unknown>)
  }
  return value
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = redactValue(key, value)
  }
  return result
}

// Exported for testing
export { redactObject, redactValue }

const redactPii = format(info => {
  for (const [key, value] of Object.entries(info)) {
    if (key === 'level' || key === 'timestamp' || key === 'service') continue
    info[key] = redactValue(key, value)
  }
  return info
})

export function createLogger(service = 'unitae-app') {
  return createWinstonLogger({
    level: process.env.UNITAE_LOG_LEVEL || 'info',
    defaultMeta: {
      service,
    },
    format: combine(errors({ stack: true }), timestamp(), redactPii(), json()),
    transports: [new transports.Console()],
  })
}

export const logger = createLogger('unitae-app')

export default logger
