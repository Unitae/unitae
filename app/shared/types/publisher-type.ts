export enum PublisherType {
  Normal = 'normal',
  PionnierAuxiliaires = 'pionnier-auxiliaires',
  PionnierPermanant = 'pionnier-permanant',
  PionnierSpecial = 'pionnier-special',
  Missionnaire = 'missionnaire',
}

export function publisherTypeReportsHours(type: string): boolean {
  return type !== PublisherType.Normal
}
