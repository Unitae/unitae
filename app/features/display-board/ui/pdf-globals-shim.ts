// es-abstract (a transitive dep of es-arraybuffer-base64) references Node's `global`
// without falling back to `globalThis`, so browsers throw `ReferenceError: global is
// not defined` when the polyfill runs. Alias `global` to `globalThis` for the duration
// of the PDF viewer's bundle.
const scope = globalThis as typeof globalThis & { global?: typeof globalThis }
if (typeof scope.global === 'undefined') {
  scope.global = globalThis
}

export {}
