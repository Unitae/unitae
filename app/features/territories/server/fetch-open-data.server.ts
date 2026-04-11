import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { parse } from 'csv'
import type { TransactionClient } from '~/shared/libs/db.server'

export async function fetchOpenData(db: TransactionClient) {
  const banoUrl = await db.setting.findFirst({ where: { key: 'bano-url' } })
  if (!banoUrl?.value || banoUrl.value === '') {
    return new Readable().pipe(parse({ delimiter: ',' }))
  }

  const response = await fetch(banoUrl.value)

  if (response.status !== 200 || response.body == null) {
    return new Readable().pipe(parse({ delimiter: ',' }))
  }

  return Readable.fromWeb(response.body as ReadableStream<Uint8Array<ArrayBufferLike>>).pipe(parse({ delimiter: ',' }))
}
