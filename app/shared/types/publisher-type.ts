import { PublisherType } from '~/database/generated/client'

export { PublisherType }

export function publisherTypeReportsHours(type: string): boolean {
  return type !== PublisherType.Normal
}
