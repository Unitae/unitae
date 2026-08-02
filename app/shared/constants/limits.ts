// Domain limits and time windows.

// Time windows
export const MS_PER_HOUR = 60 * 60 * 1000
export const MS_PER_DAY = 24 * MS_PER_HOUR
export const THREE_DAYS_MS = 3 * MS_PER_DAY
export const TWO_WEEKS_MS = 14 * MS_PER_DAY
export const FOUR_WEEKS_MS = 28 * MS_PER_DAY

// Session cookie max-age (`cookie.maxAge` is expressed in seconds, not ms)
export const SESSION_MAX_AGE_SECONDS_PROD = 60 * 60
export const SESSION_MAX_AGE_SECONDS_DEV = 60 * 60 * 8

// Import: Prisma default is 5s — bump to survive multi-thousand-row NDJSON
// replays; maxWait grows too so we don't fail to acquire a pool connection.
export const IMPORT_TX_TIMEOUT_MS = 10 * 60 * 1000
export const IMPORT_TX_MAX_WAIT_MS = 30 * 1000

// Geocoded addresses are stable — 90-day cache TTL.
export const GEOCODER_CACHE_TTL_SECONDS = 60 * 60 * 24 * 90

// Progress / thresholds
// Import advances through 39 discrete step blocks; the last 5% is reserved
// for finalization + audit writes after the transaction commits.
export const IMPORT_TOTAL_STEPS = 39
export const IMPORT_PROGRESS_CAP = 95

// Export streams NDJSON up to 90%; the trailing 10% is packaging + upload.
export const EXPORT_PROGRESS_CAP = 90

// Number of alternate results kept on a geocoder hit (top match + N).
export const GEOCODER_MAX_ALTERNATES = 2

// Retention window before a left member is auto-anonymised by the
// retention cron. Members with `leftAt` older than this are scrubbed.
// Six months matches the smallest common EU privacy-law window; a
// per-congregation override is a future wave.
export const DEFAULT_RETENTION_MONTHS = 6

// Retention cron cadence — run daily at 03:00 UTC (quiet hours for
// most subscribers).
export const RETENTION_CRON_HOUR_UTC = 3
