declare const __brand: unique symbol
type Brand<T, B> = T & { [__brand]: B }

export type CongregationId = Brand<number, 'CongregationId'>
export type UserId = Brand<number, 'UserId'>
export type MemberId = Brand<number, 'MemberId'>
export type TerritoryId = Brand<number, 'TerritoryId'>
export type BuildingId = Brand<number, 'BuildingId'>
