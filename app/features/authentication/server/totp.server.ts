import { Secret, TOTP } from 'otpauth'

// RFC-6238 defaults, matching what Google Authenticator / Authy / 1Password expect.
const ISSUER = 'Unitae'
const ALGORITHM = 'SHA1'
const DIGITS = 6
const PERIOD = 30
// Accept the adjacent time steps (±30s) to tolerate device clock drift.
const VALIDATION_WINDOW = 1
// 20 bytes = 160 bits, the RFC-4226 recommended HMAC-SHA1 key size.
const SECRET_BYTES = 20
const CODE_PATTERN = /^\d{6}$/

/** Generates a fresh random base32 TOTP seed. */
export function generateTotpSecret(): string {
  return new Secret({ size: SECRET_BYTES }).base32
}

function buildTotp(base32Secret: string, label?: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: label ?? ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(base32Secret),
  })
}

/** Builds the `otpauth://` provisioning URI to encode in the enrollment QR code. */
export function buildOtpAuthUri(email: string, base32Secret: string): string {
  return buildTotp(base32Secret, email).toString()
}

/** Returns true if `code` is valid for `base32Secret` within the drift window. */
export function verifyTotpCode(base32Secret: string, code: string): boolean {
  if (!CODE_PATTERN.test(code)) return false

  const delta = buildTotp(base32Secret).validate({ token: code, window: VALIDATION_WINDOW })
  return delta !== null
}
