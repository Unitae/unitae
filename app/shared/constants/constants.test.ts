import { describe, expect, test } from 'vitest'

import {
  DEFAULT_RETENTION_MONTHS,
  EXPORT_PROGRESS_CAP,
  GEOCODER_CACHE_TTL_SECONDS,
  GEOCODER_MAX_ALTERNATES,
  IMPORT_PROGRESS_CAP,
  IMPORT_TOTAL_STEPS,
  IMPORT_TX_MAX_WAIT_MS,
  IMPORT_TX_TIMEOUT_MS,
  MS_PER_DAY,
  MS_PER_HOUR,
  RETENTION_CRON_HOUR_UTC,
  SESSION_MAX_AGE_SECONDS_DEV,
  SESSION_MAX_AGE_SECONDS_PROD,
  THREE_DAYS_MS,
  TWO_WEEKS_MS,
} from './limits'
import { DASHBOARD_RECENT_ITEMS_LIMIT, RECENT_ATTRIBUTIONS_LIMIT } from './pagination'
import {
  EMAIL_QUEUE_ATTEMPTS,
  EMAIL_QUEUE_BACKOFF_MS,
  EMAIL_QUEUE_REMOVE_ON_COMPLETE,
  EMAIL_QUEUE_REMOVE_ON_FAIL,
  SYNC_QUEUE_ATTEMPTS,
  SYNC_QUEUE_BACKOFF_MS,
  SYNC_QUEUE_REMOVE_ON_COMPLETE,
  SYNC_QUEUE_REMOVE_ON_FAIL,
  THUMBNAIL_QUEUE_ATTEMPTS,
  THUMBNAIL_QUEUE_BACKOFF_MS,
  THUMBNAIL_QUEUE_REMOVE_ON_COMPLETE,
  THUMBNAIL_QUEUE_REMOVE_ON_FAIL,
} from './queue-delays'

// Guardrail: the values below are the source of truth. Migrating call sites
// must NOT change the effective numbers — this suite fails if a literal drifts.

describe('queue-delays constants', () => {
  test('sync queue defaults match the pre-extraction BullMQ config', () => {
    expect(SYNC_QUEUE_ATTEMPTS).toBe(3)
    expect(SYNC_QUEUE_BACKOFF_MS).toBe(10_000)
    expect(SYNC_QUEUE_REMOVE_ON_COMPLETE).toBe(5)
    expect(SYNC_QUEUE_REMOVE_ON_FAIL).toBe(10)
  })

  test('thumbnail queue defaults match the pre-extraction BullMQ config', () => {
    expect(THUMBNAIL_QUEUE_ATTEMPTS).toBe(3)
    expect(THUMBNAIL_QUEUE_BACKOFF_MS).toBe(5_000)
    expect(THUMBNAIL_QUEUE_REMOVE_ON_COMPLETE).toBe(20)
    expect(THUMBNAIL_QUEUE_REMOVE_ON_FAIL).toBe(10)
  })

  test('email queue defaults match the pre-extraction BullMQ config', () => {
    expect(EMAIL_QUEUE_ATTEMPTS).toBe(3)
    expect(EMAIL_QUEUE_BACKOFF_MS).toBe(5_000)
    expect(EMAIL_QUEUE_REMOVE_ON_COMPLETE).toBe(10)
    expect(EMAIL_QUEUE_REMOVE_ON_FAIL).toBe(20)
  })
})

describe('pagination constants', () => {
  test('DASHBOARD_RECENT_ITEMS_LIMIT is 5', () => {
    expect(DASHBOARD_RECENT_ITEMS_LIMIT).toBe(5)
  })

  test('RECENT_ATTRIBUTIONS_LIMIT is 5', () => {
    expect(RECENT_ATTRIBUTIONS_LIMIT).toBe(5)
  })
})

describe('limits — time windows', () => {
  test('MS_PER_DAY equals 24 hours in milliseconds', () => {
    expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000)
  })

  test('MS_PER_HOUR equals one hour in milliseconds', () => {
    expect(MS_PER_HOUR).toBe(60 * 60 * 1000)
  })

  test('TWO_WEEKS_MS derives from MS_PER_DAY', () => {
    expect(TWO_WEEKS_MS).toBe(14 * MS_PER_DAY)
  })

  test('THREE_DAYS_MS derives from MS_PER_DAY', () => {
    expect(THREE_DAYS_MS).toBe(3 * MS_PER_DAY)
  })

  test('session max-age constants match the historical prod/dev split', () => {
    expect(SESSION_MAX_AGE_SECONDS_PROD).toBe(60 * 60)
    expect(SESSION_MAX_AGE_SECONDS_DEV).toBe(60 * 60 * 8)
  })

  test('import transaction bounds match the historical Prisma config', () => {
    expect(IMPORT_TX_TIMEOUT_MS).toBe(10 * 60 * 1000)
    expect(IMPORT_TX_MAX_WAIT_MS).toBe(30 * 1000)
  })

  test('geocoder cache TTL is 90 days in seconds', () => {
    expect(GEOCODER_CACHE_TTL_SECONDS).toBe(60 * 60 * 24 * 90)
  })
})

describe('limits — progress / thresholds', () => {
  test('IMPORT_TOTAL_STEPS is 41', () => {
    // Must equal the number of progress() calls in runImport, or the bar lies.
    expect(IMPORT_TOTAL_STEPS).toBe(41)
  })

  test('IMPORT_PROGRESS_CAP reserves the last 5% for finalization', () => {
    expect(IMPORT_PROGRESS_CAP).toBe(95)
  })

  test('EXPORT_PROGRESS_CAP reserves the last 10% for finalization', () => {
    expect(EXPORT_PROGRESS_CAP).toBe(90)
  })

  test('GEOCODER_MAX_ALTERNATES is 2', () => {
    expect(GEOCODER_MAX_ALTERNATES).toBe(2)
  })

  test('DEFAULT_RETENTION_MONTHS is 6 (smallest common EU privacy window)', () => {
    expect(DEFAULT_RETENTION_MONTHS).toBe(6)
  })

  test('RETENTION_CRON_HOUR_UTC is 3 (daily 03:00 UTC — quiet hours)', () => {
    expect(RETENTION_CRON_HOUR_UTC).toBe(3)
  })
})
