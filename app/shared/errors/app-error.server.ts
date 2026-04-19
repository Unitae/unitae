/**
 * Base class for all application-level errors.
 * These represent expected failure cases that service functions throw
 * and route actions catch to produce user-facing responses.
 */
export abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND'
  readonly statusCode = 404

  constructor(entity: string, id?: number) {
    super(`${entity} not found${id ? `: ${id}` : ''}`)
  }
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR'
  readonly statusCode = 400

  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message)
  }
}

export class ConflictError extends AppError {
  readonly code = 'CONFLICT'
  readonly statusCode = 409

  constructor(message: string) {
    super(message)
  }
}

export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN'
  readonly statusCode = 403

  constructor(message?: string) {
    super(message ?? 'Forbidden')
  }
}

export class LimitReachedError extends AppError {
  readonly code = 'LIMIT_REACHED'
  readonly statusCode = 429

  constructor(public readonly limitName: string) {
    super(`Limit reached: ${limitName}`)
  }
}
