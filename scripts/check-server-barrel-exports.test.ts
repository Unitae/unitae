import { describe, expect, it } from 'vitest'
import { analyzeBarrel } from './check-server-barrel-exports'

describe('analyzeBarrel — flags server re-exports from client-safe barrels', () => {
  it('flags a named re-export from a *.server module', () => {
    const source = "export { findX } from './server/x.server'"
    const v = analyzeBarrel('app/features/territories/index.ts', source)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(1)
    expect(v[0].serverModule).toBe('./server/x.server')
  })

  it('flags a namespace re-export (export * as ns)', () => {
    const source = "export * as xAggregate from './server/x.aggregate'"
    const v = analyzeBarrel('app/features/territories/index.ts', source)
    expect(v).toHaveLength(1)
  })

  it('flags a *.server.tsx module too', () => {
    const source = "export { render } from './server/render.server.tsx'"
    const v = analyzeBarrel('app/features/board/index.ts', source)
    expect(v).toHaveLength(1)
  })

  it('does not flag re-exports from client-safe modules (ui / model / schemas)', () => {
    const source = [
      "export { Foo } from './ui/Foo'",
      "export type { FooType } from './model/foo.type'",
      "export { fooSchema } from './schemas/foo.schema'",
    ].join('\n')
    const v = analyzeBarrel('app/features/territories/index.ts', source)
    expect(v).toHaveLength(0)
  })

  it('does not run inside a *.server.ts barrel (server-side is allowed there)', () => {
    const source = "export { findX } from './server/x.server'"
    const v = analyzeBarrel('app/features/territories/index.server.ts', source)
    expect(v).toHaveLength(0)
  })

  it('does not run inside route/component files', () => {
    const source = "export { findX } from './server/x.server'"
    for (const path of [
      'app/features/territories/routes/list.tsx',
      'app/features/territories/server/foo.server.ts',
      'app/features/territories/ui/Foo.tsx',
    ]) {
      expect(analyzeBarrel(path, source)).toHaveLength(0)
    }
  })

  it('ignores lines inside single-line comments', () => {
    const source = ['// export { findX } from "./server/x.server"', "export { Foo } from './ui/Foo'"].join('\n')
    const v = analyzeBarrel('app/features/territories/index.ts', source)
    expect(v).toHaveLength(0)
  })

  it('flags each violation at its own line number', () => {
    const source = [
      "export { A } from './ui/A'",
      "export { findX } from './server/x.server'",
      "export { B } from './ui/B'",
      "export * as agg from './server/y.aggregate'",
    ].join('\n')
    const v = analyzeBarrel('app/features/territories/index.ts', source)
    expect(v).toHaveLength(2)
    expect(v.map((x: { line: number }) => x.line)).toEqual([2, 4])
  })
})
