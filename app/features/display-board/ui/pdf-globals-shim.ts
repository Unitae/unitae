// es-abstract (a transitive dep of es-arraybuffer-base64) references Node's
// `global` instead of `globalThis`, so browsers throw `ReferenceError: global
// is not defined` when the polyfill runs. Alias the page's `global` to
// `globalThis`.
//
// Safe to delete once es-abstract uses `globalThis` directly, or once minimum
// supported browsers ship native Uint8Array base64/hex methods (Chrome 140+,
// Safari 18.2+, Firefox 133+) and we drop `es-arraybuffer-base64`.
const scope = globalThis as typeof globalThis & { global?: typeof globalThis }
scope.global ??= globalThis

export {}
