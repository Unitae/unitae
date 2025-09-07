export enum ShopKind {
  Food = 'alimentaire',
  Clothing = 'vetements-chaussures',
  Jewelry = 'bijoux',
  Health = 'santé-optique',
  Home = 'maison',
  Catering = 'restauration-snack-café',
  Cosmetics = 'coiffure-cosmetiques',
  Tech = 'technologie',
  Newspaper = 'tabac-presse-librairie',
  GasStation = 'station-service',
  Other = 'autre',
}

// biome-ignore lint/style/useNamingConvention: labels map keyed by enum
export const shopKindLabels: { [key in ShopKind]: string } = {
  [ShopKind.Catering]: 'Restaurant / Café / Snack',
  [ShopKind.Clothing]: 'Vêtements / Chaussures',
  [ShopKind.Cosmetics]: 'Coiffure / Cosmétiques',
  [ShopKind.Food]: 'Alimentaire',
  [ShopKind.Health]: 'Santé / Optique',
  [ShopKind.Home]: 'Maison',
  [ShopKind.Jewelry]: 'Bijoux',
  [ShopKind.Newspaper]: 'Tabac / Press',
  [ShopKind.GasStation]: 'Station Services',
  [ShopKind.Tech]: 'Technologie',
  [ShopKind.Other]: 'Autres',
}
