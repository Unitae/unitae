import * as m from '~/i18n/paraglide/messages'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function written(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? m.common_yes() : m.common_no()
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value) && value.every(each => typeof each !== 'object' || each == null))
    return value.length ? value.map(written).join(', ') : '—'
  if (isRecord(value) && Object.keys(value).length === 2 && 'from' in value && 'to' in value)
    return `${written(value.from)} → ${written(value.to)}`
  return JSON.stringify(value)
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * What an audit row recorded (its values, stored as JSON), as lines to read: each key with its value, a change as
 * « before → after », a list joined, a flag as yes or no. The keys are the ones the code stored; any other shape is
 * written as stored, and text that is not an object of values says nothing.
 */
export function auditDetails(metadata: string | null): { key: string; value: string }[] {
  const values = metadata ? parsed(metadata) : null
  if (!isRecord(values)) return []
  return Object.entries(values).map(([key, value]) => ({ key, value: written(value) }))
}
