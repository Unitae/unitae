import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { parse } from 'csv'
import type { TransactionClient } from '~/shared/infra/db.server'
import { capBytes, safeOpenDataFetch } from './safe-open-data-fetch.server'

function emptyStream() {
  return Readable.from([]).pipe(parse({ delimiter: ',' }))
}

export async function fetchOpenData(db: TransactionClient) {
  const banoUrl = await db.setting.findFirst({ where: { key: 'bano-url' } })
  if (!banoUrl?.value || banoUrl.value === '') {
    return emptyStream()
  }

  // Let validation/DNS/network errors propagate. `fetchOpenData` runs inside the
  // `importOpenData` transaction, which has already reset the tenant's buildings
  // to `inOpenData: false` before calling us. Throwing rolls that reset back
  // (data preserved) and fails the sync job visibly; swallowing the error would
  // instead commit the reset and silently wipe the tenant's open-data buildings.
  const response = await safeOpenDataFetch(banoUrl.value)

  if (response.status !== 200 || response.body == null) {
    return emptyStream()
  }

  const parser = parse({ delimiter: ',' })
  const body = capBytes(Readable.fromWeb(response.body as ReadableStream<Uint8Array<ArrayBufferLike>>))
  // Forward a mid-stream failure (byte cap exceeded, timeout, connection reset)
  // to the parser so the consumer's `parser.on('error')` rejects and the sync
  // rolls back. Without this, the error surfaces as an unhandled 'error' event
  // on `body` and crashes the worker process for every tenant.
  body.on('error', error => parser.destroy(error))
  return body.pipe(parser)
}
