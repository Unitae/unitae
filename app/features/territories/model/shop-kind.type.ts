import * as m from '~/paraglide/messages'

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
export function shopKindLabels(): { [key in ShopKind]: string } {
  return {
    [ShopKind.Catering]: m.shop_kind_catering(),
    [ShopKind.Clothing]: m.shop_kind_clothing(),
    [ShopKind.Cosmetics]: m.shop_kind_cosmetics(),
    [ShopKind.Food]: m.shop_kind_food(),
    [ShopKind.Health]: m.shop_kind_health(),
    [ShopKind.Home]: m.shop_kind_home(),
    [ShopKind.Jewelry]: m.shop_kind_jewelry(),
    [ShopKind.Newspaper]: m.shop_kind_newspaper(),
    [ShopKind.GasStation]: m.shop_kind_gas_station(),
    [ShopKind.Tech]: m.shop_kind_tech(),
    [ShopKind.Other]: m.shop_kind_other(),
  }
}
