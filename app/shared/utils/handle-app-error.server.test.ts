import { describe, expect, it } from 'vitest'
import {
  ConflictError,
  ForbiddenError,
  LimitReachedError,
  NotFoundError,
  ValidationError,
} from '~/shared/errors/app-error.server'
import { appErrorToClientMessage } from './handle-app-error.server'

describe('appErrorToClientMessage', () => {
  it('returns a non-empty message for LimitReachedError', () => {
    const message = appErrorToClientMessage(new LimitReachedError('territories'))
    expect(message).not.toBe('')
    expect(typeof message).toBe('string')
  })

  it('returns a non-empty message for NotFoundError', () => {
    const message = appErrorToClientMessage(new NotFoundError('Territory', 42))
    expect(message).not.toBe('')
  })

  it('returns a non-empty message for ConflictError', () => {
    const message = appErrorToClientMessage(new ConflictError('duplicate'))
    expect(message).not.toBe('')
  })

  it('returns a non-empty message for ForbiddenError', () => {
    const message = appErrorToClientMessage(new ForbiddenError())
    expect(message).not.toBe('')
  })

  it('returns a non-empty message for ValidationError', () => {
    const message = appErrorToClientMessage(new ValidationError('number', 'bad number'))
    expect(message).not.toBe('')
  })

  it('distinguishes between error types with different messages', () => {
    const limit = appErrorToClientMessage(new LimitReachedError('territories'))
    const notFound = appErrorToClientMessage(new NotFoundError('Territory'))
    const conflict = appErrorToClientMessage(new ConflictError('duplicate'))
    expect(new Set([limit, notFound, conflict]).size).toBe(3)
  })

  it('surfaces the limit resource label in the LimitReachedError message', () => {
    const known = appErrorToClientMessage(new LimitReachedError('territories'))
    const unknown = appErrorToClientMessage(new LimitReachedError('somethingUnexpected'))
    // Known limits get localised labels; unknowns fall back to the raw name.
    expect(known).not.toBe(unknown)
    expect(unknown).toContain('somethingUnexpected')
  })
})
