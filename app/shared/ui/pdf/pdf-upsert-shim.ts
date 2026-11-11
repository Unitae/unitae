// pdfjs-dist >= 5.5 calls `Map.prototype.getOrInsertComputed` (TC39 upsert
// proposal). Native support: Chrome 145+, Firefox 144+, Safari 18.4+. Older
// engines (Samsung Internet 29 = Chromium 136, in-app webviews, etc.) throw
// `getOrInsertComputed is not a function` during PDF render.
//
// Polyfill Map/WeakMap with both `getOrInsert` and `getOrInsertComputed`
// before pdfjs-dist loads. Safe to delete once minimum supported browsers
// ship the methods natively.
// biome-ignore lint/suspicious/noExplicitAny: prototype patching needs loose typing
type AnyMap = { has(k: any): boolean; get(k: any): any; set(k: any, v: any): unknown }

function defineIfMissing(target: object, name: string, fn: (this: AnyMap, ...args: unknown[]) => unknown) {
  if (typeof (target as Record<string, unknown>)[name] === 'function') return
  Object.defineProperty(target, name, { value: fn, writable: true, configurable: true })
}

function getOrInsert(this: AnyMap, key: unknown, value: unknown) {
  if (this.has(key)) return this.get(key)
  this.set(key, value)
  return value
}

function getOrInsertComputed(this: AnyMap, key: unknown, callbackFn: unknown) {
  if (typeof callbackFn !== 'function') throw new TypeError('callbackFn must be callable')
  if (this.has(key)) return this.get(key)
  const value = (callbackFn as (k: unknown) => unknown)(key)
  this.set(key, value)
  return value
}

defineIfMissing(Map.prototype, 'getOrInsert', getOrInsert)
defineIfMissing(Map.prototype, 'getOrInsertComputed', getOrInsertComputed)
defineIfMissing(WeakMap.prototype, 'getOrInsert', getOrInsert)
defineIfMissing(WeakMap.prototype, 'getOrInsertComputed', getOrInsertComputed)

export {}
