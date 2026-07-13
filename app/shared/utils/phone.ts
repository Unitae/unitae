import { z } from 'zod'

// Loose phone-format check. Accepts digits, spaces, hyphens, parentheses,
// dots, and an optional leading `+`. Rejects letters and other punctuation.
// 6–20 characters — tight enough to reject obviously-invalid input,
// loose enough to accept every real-world national format.
//
// A full E.164 parse (`libphonenumber-js`) would tighten this further at
// the cost of a ~140kB dependency. Not worth it today — this validator is
// only a boundary check; downstream code treats the string as opaque.
const PHONE_RE = /^\+?[\d\s\-().]+$/

const PHONE_MIN_LENGTH = 6
const PHONE_MAX_LENGTH = 20

/**
 * Zod schema for an optional phone field.
 * Empty string is accepted (defaults to `''`).
 */
export const phoneSchema = z
  .string()
  .refine(v => v === '' || (v.length >= PHONE_MIN_LENGTH && v.length <= PHONE_MAX_LENGTH && PHONE_RE.test(v)), {
    message: 'Phone must be 6–20 characters and contain only digits, spaces, hyphens, parentheses, dots, or +',
  })
  .optional()
  .default('')
