export enum EntranceKind {
  Residential = 'residential',
  Commerce = 'commerce',
  Hotel = 'hotel',
  Laundromat = 'laundromat',
  Campus = 'campus',
}

// biome-ignore lint/style/useNamingConvention: labels map keyed by enum
export const entranceKindLabels: { [key in EntranceKind]: string } = {
  [EntranceKind.Residential]: 'Résidentiel',
  [EntranceKind.Commerce]: 'Commerce',
  [EntranceKind.Hotel]: 'Hôtel',
  [EntranceKind.Laundromat]: 'Laverie',
  [EntranceKind.Campus]: 'Résidence universitaire',
}
