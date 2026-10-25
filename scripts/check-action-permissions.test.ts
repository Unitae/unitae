import { describe, expect, it } from 'vitest'
import { checkActionSource, collectLocalFunctions, extractAction, reachableSource } from './check-action-permissions'

const ROUTE = 'app/features/example/routes/thing.tsx'

describe('extractAction', () => {
  it('returns the body of an async function action', () => {
    const src = 'export async function action({ context }: Args) {\n  doIt()\n}\nexport function loader() {}'
    expect(extractAction(src)).toContain('doIt()')
    expect(extractAction(src)).not.toContain('loader')
  })

  it('returns null for a module without an action', () => {
    expect(extractAction('export function loader() { return null }')).toBeNull()
  })
})

describe('checkActionSource', () => {
  it('passes an action that calls requirePermission', () => {
    const src = [
      'export async function action({ context }: Args) {',
      '  const permissions = context.get(permissionsContext)',
      '  requirePermission(permissions, Permission.CanManageUsers)',
      '}',
    ].join('\n')
    expect(checkActionSource(ROUTE, src)).toMatchObject({ enforced: true, via: 'body' })
  })

  it('passes an action guarded by a negated has() that throws', () => {
    const src = [
      'export async function action({ context }: Args) {',
      '  if (!permissions.has(Permission.CanManageRoles)) throw redirect("/")',
      '}',
    ].join('\n')
    expect(checkActionSource(ROUTE, src)?.enforced).toBe(true)
  })

  it('fails an action that only reads a permission for the UI', () => {
    const src = [
      'export async function action({ context }: Args) {',
      '  const canEdit = permissions.has(Permission.CanManageUsers)',
      '  return { canEdit }',
      '}',
    ].join('\n')
    expect(checkActionSource(ROUTE, src)).toMatchObject({ enforced: false, via: 'none' })
  })

  // The bug class this guards: the page's loader checks, the action does not.
  it('fails an action whose loader checks but which does not', () => {
    const src = [
      'export function loader({ context }: Args) {',
      '  requirePermission(permissions, Permission.CanManagePublishers)',
      '}',
      'export async function action({ request }: Args) {',
      '  await createMember(db, await request.formData())',
      '}',
    ].join('\n')
    expect(checkActionSource(ROUTE, src)?.enforced).toBe(false)
  })

  it('follows a same-file helper the action calls', () => {
    const src = [
      'function guard(permissions: Set<Permission>) {',
      '  requirePermission(permissions, Permission.CanManageUsers)',
      '}',
      'export async function action({ context }: Args) {',
      '  guard(context.get(permissionsContext))',
      '}',
    ].join('\n')
    expect(checkActionSource(ROUTE, src)?.enforced).toBe(true)
  })

  it('accepts a listed delegate', () => {
    const src = 'export function action(args: Args) {\n  return runLifecycleAction({ ...args })\n}'
    expect(checkActionSource(ROUTE, src)).toMatchObject({ enforced: true, via: 'delegate' })
  })

  it('accepts an allowlisted route', () => {
    const src = 'export async function action({ request }: Args) {\n  return logout(request)\n}'
    expect(checkActionSource('app/features/authentication/routes/logout.tsx', src)).toMatchObject({
      enforced: true,
      via: 'allowlist',
    })
  })
})

describe('reachableSource', () => {
  it('does not loop on mutually recursive helpers', () => {
    const src = 'function a() { b() }\nfunction b() { a() }\nexport async function action() { a() }'
    const action = extractAction(src) ?? ''
    expect(reachableSource(action, collectLocalFunctions(src))).toContain('function b()')
  })
})
