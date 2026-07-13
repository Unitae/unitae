import { describe, expect, it } from 'vitest'
import { classifyServiceFile } from './check-service-test-coverage'

const EXEMPT = new Set<string>(['app/features/publishers/index.server.ts', 'app/features/events/server/glue.server.ts'])

function siblingFiles(paths: string[]): Set<string> {
  return new Set(paths)
}

describe('classifyServiceFile', () => {
  it('reports a violation for a service file with no adjacent test', () => {
    const v = classifyServiceFile(
      'app/features/publishers/server/foo.server.ts',
      siblingFiles(['app/features/publishers/server/foo.server.ts']),
      EXEMPT,
    )
    expect(v).toEqual({
      status: 'violation',
      file: 'app/features/publishers/server/foo.server.ts',
    })
  })

  it('reports covered when a co-located *.test.ts exists', () => {
    const v = classifyServiceFile(
      'app/features/publishers/server/foo.server.ts',
      siblingFiles([
        'app/features/publishers/server/foo.server.ts',
        'app/features/publishers/server/foo.server.test.ts',
      ]),
      EXEMPT,
    )
    expect(v.status).toBe('covered')
  })

  it('reports covered when a co-located *.integration.test.ts exists', () => {
    const v = classifyServiceFile(
      'app/features/publishers/server/bar.server.ts',
      siblingFiles([
        'app/features/publishers/server/bar.server.ts',
        'app/features/publishers/server/bar.server.integration.test.ts',
      ]),
      EXEMPT,
    )
    expect(v.status).toBe('covered')
  })

  it('reports covered when both unit and integration tests exist', () => {
    const v = classifyServiceFile(
      'app/features/publishers/server/baz.server.ts',
      siblingFiles([
        'app/features/publishers/server/baz.server.ts',
        'app/features/publishers/server/baz.server.test.ts',
        'app/features/publishers/server/baz.server.integration.test.ts',
      ]),
      EXEMPT,
    )
    expect(v.status).toBe('covered')
  })

  it('reports exempt when the file is on the grandfather list', () => {
    const v = classifyServiceFile(
      'app/features/publishers/index.server.ts',
      siblingFiles(['app/features/publishers/index.server.ts']),
      EXEMPT,
    )
    expect(v.status).toBe('exempt')
  })

  it('recognises the .aggregate / .workflow / .queries / .policy suffixes', () => {
    for (const rel of [
      'app/features/publishers/server/member.aggregate.ts',
      'app/features/settings/server/anonymize.workflow.ts',
      'app/features/settings/server/territory-settings.queries.ts',
      'app/features/events/server/programme-assignment.policy.ts',
    ]) {
      const v = classifyServiceFile(rel, siblingFiles([rel]), EXEMPT)
      expect(v.status, `expected ${rel} to be a service file`).toBe('violation')
    }
  })

  it('does not classify test files themselves', () => {
    const v = classifyServiceFile(
      'app/features/publishers/server/foo.server.test.ts',
      siblingFiles(['app/features/publishers/server/foo.server.test.ts']),
      EXEMPT,
    )
    expect(v.status).toBe('not-service')
  })

  it('does not classify non-service files (routes, ui, model, schemas)', () => {
    for (const rel of [
      'app/features/publishers/routes/publisher.tsx',
      'app/features/publishers/ui/Publisher.tsx',
      'app/features/publishers/model/publisher.type.ts',
      'app/features/publishers/schemas/publisher.schema.ts',
    ]) {
      const v = classifyServiceFile(rel, siblingFiles([rel]), EXEMPT)
      expect(v.status, `${rel} should not be a service file`).toBe('not-service')
    }
  })

  it('does not classify barrel index.ts (only .server.ts variant applies)', () => {
    // A plain index.ts is client-safe; only *.server.ts / .aggregate.ts / ... count.
    const v = classifyServiceFile(
      'app/features/publishers/index.ts',
      siblingFiles(['app/features/publishers/index.ts']),
      EXEMPT,
    )
    expect(v.status).toBe('not-service')
  })
})
