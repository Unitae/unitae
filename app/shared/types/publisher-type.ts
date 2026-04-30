import { PublisherType } from '~/database/generated/enums'

export { PublisherType }

export function publisherTypeReportsHours(type: string): boolean {
  return type !== PublisherType.Normal
}
