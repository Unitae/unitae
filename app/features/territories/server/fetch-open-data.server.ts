import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { parse } from 'csv'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { capBytes, safeOpenDataFetch } from './safe-open-data-fetch.server'

const logger = createLogger('open-data')

function emptyStream() {
  return Readable.from([]).pipe(parse({ delimiter: ',' }))
}

export async function fetchOpenData(db: TransactionClient) {
  const banoUrl = await db.setting.findFirst({ where: { key: 'bano-url' } })
  if (!banoUrl?.value || banoUrl.value === '') {
    return emptyStream()
  }

  try {
    const response = await safeOpenDataFetch(banoUrl.value)

    if (response.status !== 200 || response.body == null) {
      return emptyStream()
    }

    const body = Readable.fromWeb(response.body as ReadableStream<Uint8Array<ArrayBufferLike>>)
    return capBytes(body).pipe(parse({ delimiter: ',' }))
  } catch (error) {
    // Soft-fail: `importOpenData` has already reset the existing buildings before
    // calling us, so throwing here would strand the tenant's data. Skip the sync
    // instead and surface the rejected URL for the operator.
    logger.warn('Refused to fetch open-data URL', { error })
    return emptyStream()
  }
}
