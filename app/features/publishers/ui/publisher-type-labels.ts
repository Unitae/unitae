import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'

/** The service a report records, as a table tag: « Permanent », « Auxiliaire »… Nothing for a publisher. */
export function serviceShortLabel(type: PublisherType): string | null {
  switch (type) {
    case PublisherType.PionnierPermanant:
      return m.activity_service_permanent_short()
    case PublisherType.PionnierAuxiliaires:
      return m.activity_service_auxiliary_short()
    case PublisherType.PionnierSpecial:
      return m.activity_service_special_short()
    case PublisherType.Missionnaire:
      return m.activity_service_missionary_short()
    default:
      return null
  }
}

/** The service in full: « Pionnier permanent », « Proclamateur »… */
export function serviceLabel(type: PublisherType): string {
  switch (type) {
    case PublisherType.PionnierPermanant:
      return m.activity_filters_type_regular_pioneer()
    case PublisherType.PionnierAuxiliaires:
      return m.activity_filters_type_auxiliary_pioneer()
    case PublisherType.PionnierSpecial:
      return m.activity_filters_type_special_pioneer()
    case PublisherType.Missionnaire:
      return m.activity_filters_type_missionary()
    default:
      return m.activity_filters_type_normal()
  }
}
