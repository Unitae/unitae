import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const APP_DIR = join(ROOT, 'app')

// `import './x'` with no binding: the module is imported for what it does when it is evaluated.
const BARE_IMPORT = /^import\s+['"]((?:~|\.{1,2})\/[^'"]+)['"]/gm
const SOURCE_FILE = /\.tsx?$/
const TEST_FILE = /\.test\.tsx?$/
const GLOB_SPECIAL_CHARS = /[.+^${}()|[\]\\]/g
const GLOBSTAR_SEGMENT = /\*\*\//g
const GLOB_WILDCARD = /\*/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' || entry.name === 'paraglide' ? [] : sourceFiles(path)
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) ? [path] : []
  })
}

function importedFile(importer: string, specifier: string): string {
  const target = specifier.startsWith('~/') ? join(APP_DIR, specifier.slice(2)) : resolve(dirname(importer), specifier)
  return relative(ROOT, extname(target) === '.css' ? target : `${target}.ts`)
}

function globToRegExp(glob: string): RegExp {
  const pattern = glob
    .replace(GLOB_SPECIAL_CHARS, '\\$&')
    .replace(GLOBSTAR_SEGMENT, '\u0000')
    .replace(GLOB_WILDCARD, '[^/]*')
    .replaceAll('\u0000', '(?:.*/)?')
  return new RegExp(`^${pattern}$`)
}

describe('side-effect-only imports', () => {
  // package.json lists the modules that have side effects, and the production build drops a bare
  // import of any module that is not on the list. That is how the boot checks (environment
  // validation, the Row-Level Security guard) went missing from the built web server while every
  // test, the dev server and the worker kept running them.
  it('are all declared in package.json "sideEffects", or the production build drops them', () => {
    const { sideEffects } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { sideEffects: string[] }
    const declared = sideEffects.map(globToRegExp)

    const undeclared = sourceFiles(APP_DIR).flatMap(file =>
      [...readFileSync(file, 'utf8').matchAll(BARE_IMPORT)]
        .map(match => importedFile(file, match[1] as string))
        .filter(imported => !declared.some(pattern => pattern.test(imported)))
        .map(imported => `${relative(ROOT, file)} imports ${imported}`),
    )

    expect(undeclared).toEqual([])
  })
})
