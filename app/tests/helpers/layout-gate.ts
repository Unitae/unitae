// Runs a layout's route middleware the way React Router does before any child loader or action,
// and reports whether it let the request through or redirected it.
import { expect } from 'vitest'

type Middleware = (args: never, next: never) => unknown

export async function passesGate(middleware: readonly Middleware[] | undefined, context: unknown): Promise<boolean> {
  expect(middleware, 'the layout must gate in middleware, which also runs before child actions').toBeDefined()
  const args = { request: new Request('https://unitae.example.test/'), params: {}, context }
  try {
    for (const fn of middleware ?? []) await fn(args as never, (async () => undefined) as never)
    return true
  } catch (thrown) {
    if (thrown instanceof Response && thrown.status >= 300 && thrown.status < 400) return false
    throw thrown
  }
}
