#!/usr/bin/env tsx
// Action-permission check.
//
// React Router runs only the matched leaf route's action on a form submission: a permission
// gate in a parent layout's *loader* never applies to it. Every route action must therefore
// enforce the permission it needs itself (or run under a layout *middleware*, which does apply
// to actions, plus its own specific check where the layout admits several permissions).
//
// This check fails when an exported `action` in a route module enforces no permission:
// no `requirePermission(...)`, no negated `permissions.has(...)` whose branch throws (the same
// definition as check-permission-coverage), in its own body, in a same-file helper it calls,
// or in one of the shared helpers listed in DELEGATES — whose own files are verified to enforce.
//
// Actions that are open on purpose (sign-in flows, a user's own account) are listed in
// ALLOWLIST with the reason. Adding to it is a reviewed decision, not a way to silence the check.
//
// Usage:
//   pnpm test:action-permissions
//   pnpm test:action-permissions --json

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { collectEnforcedPermissions, matchBalanced } from './check-permission-coverage'

const ROOT = resolve(import.meta.dirname, '..')
const SCAN_DIRS = ['app/features', 'app/shell']
const ROUTE_FILE_RE = /\/routes\/.*\.tsx?$|^app\/shell\/.*\.tsx?$/
const TEST_FILE_RE = /\.(?:test|integration\.test|spec)\.tsx?$/
const ACTION_START_RE = /export\s+(?:async\s+)?function\s+action\s*\(|export\s+const\s+action\s*(?::[^=]+)?=/
const LOCAL_FUNCTION_RE =
  /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(|(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?::[^=]+)?=>/g
const CALL_RE = /\b([A-Za-z0-9_]+)\s*\(/g

// Shared helpers that enforce a permission on the action's behalf. The helper's file is
// checked too: a delegate that stops enforcing fails this check rather than silently
// opening every action that relies on it.
// `enforces` is what the delegate's file must contain to count as enforcing.
const ENFORCES_PERMISSION = /Permission\.[A-Za-z0-9_]+/
export const DELEGATES: Record<string, { file: string; enforces: RegExp }> = {
  runLifecycleAction: {
    file: 'app/features/publishers/routes/publishers/_lifecycle-action.server.ts',
    enforces: ENFORCES_PERMISSION,
  },
  // Takes a `can` closure, so the permissions are named inside the helper, not at the call site.
  canEditEvent: { file: 'app/features/events/server/events-auth.server.ts', enforces: ENFORCES_PERMISSION },
  canManageAnyProgram: { file: 'app/features/events/server/events-auth.server.ts', enforces: ENFORCES_PERMISSION },
  // Pure policy: the route feeds it booleans derived from permissions and group membership.
  canManageEmergencyInfo: { file: 'app/features/publishers/model/emergency-access.ts', enforces: /hasManager/ },
  // Platform administration is gated by the account's platformAdmin flag, not a congregation permission.
  verifyPlatformAdmin: {
    file: 'app/features/platform-admin/server/verify-platform-admin.server.ts',
    enforces: /platformAdmin/,
  },
}

// Route actions that are intentionally open to any signed-in user, or to anonymous visitors.
export const ALLOWLIST: Record<string, string> = {
  'app/features/authentication/routes/login.tsx': 'anonymous sign-in',
  'app/features/authentication/routes/logout.tsx': "ends the caller's own session",
  'app/features/authentication/routes/password-forgot.tsx': 'anonymous reset request',
  'app/features/authentication/routes/password-reset.tsx': 'anonymous, authorised by the reset token',
  'app/features/authentication/routes/two-factor-challenge.tsx':
    'second sign-in step, authorised by the pending session',
  'app/features/authentication/routes/verify-email-confirm.tsx': 'authorised by the verification token',
  'app/features/authentication/routes/verify-email.tsx': "resends the caller's own verification email",
  'app/features/authentication/routes/setup.tsx': 'first-run setup, guarded by needSetupProcess()',
  'app/features/authentication/routes/register.tsx': 'self-registration, guarded by the multi-tenant check',
  'app/features/authentication/routes/user/profile.tsx': "edits the caller's own profile",
  'app/features/authentication/routes/user/security.tsx': "changes the caller's own password and 2FA",
  'app/features/authentication/routes/user/consents.tsx': "manages the caller's own consents",
  'app/features/authentication/routes/user/calendar-feed-regenerate.tsx': "rotates the caller's own calendar feed",
  'app/features/authentication/routes/user/calendar-feed-revoke.tsx': "revokes the caller's own calendar feed",
  'app/features/notifications/routes/preferences.tsx': "edits the caller's own notification preferences",
  'app/features/events/routes/days-off/new.tsx': "records the caller's own absence",
  'app/features/events/routes/days-off/delete.tsx': "deletes the caller's own absence (ownership checked)",
  'app/shell/consent.tsx': "records the caller's own consent",
  'app/shell/csp-report.tsx': 'anonymous browser CSP violation reports, written to the log only',
  'app/shell/not-found.tsx': 'answers unmatched submissions with a 404',
}

export interface ActionReport {
  file: string
  enforced: boolean
  via: 'body' | 'delegate' | 'allowlist' | 'none'
}

/** The source of the exported `action`, or null when the module exports none. */
export function extractAction(src: string): string | null {
  const start = src.search(ACTION_START_RE)
  if (start === -1) return null
  // The body is the first `{` after the parameter list (function or arrow form).
  const paramsOpen = src.indexOf('(', start)
  const paramsClose = paramsOpen === -1 ? -1 : matchBalanced(src, paramsOpen)
  const bodyOpen = src.indexOf('{', paramsClose === -1 ? start : paramsClose)
  if (bodyOpen === -1) return null
  const bodyClose = matchBalanced(src, bodyOpen)
  return src.slice(start, bodyClose === -1 ? src.length : bodyClose)
}

/** Top-level functions declared in the module, by name. */
export function collectLocalFunctions(src: string): Map<string, string> {
  const functions = new Map<string, string>()
  for (const match of src.matchAll(LOCAL_FUNCTION_RE)) {
    const name = match[1] ?? match[2]
    if (!name || name === 'action') continue
    const open = src.indexOf('{', match.index + match[0].length - 1)
    if (open === -1) continue
    const close = matchBalanced(src, open)
    functions.set(name, src.slice(match.index, close === -1 ? src.length : close))
  }
  return functions
}

/** The action plus every same-file helper it reaches, transitively. */
export function reachableSource(action: string, locals: Map<string, string>): string {
  const seen = new Set<string>()
  const queue = [action]
  const parts: string[] = []
  while (queue.length > 0) {
    const chunk = queue.shift() as string
    parts.push(chunk)
    for (const call of chunk.matchAll(CALL_RE)) {
      const name = call[1]
      if (seen.has(name) || !locals.has(name)) continue
      seen.add(name)
      queue.push(locals.get(name) as string)
    }
  }
  return parts.join('\n')
}

export function delegatesTo(source: string): string[] {
  return Object.keys(DELEGATES).filter(name => new RegExp(`\\b${name}\\s*\\(`).test(source))
}

export function checkActionSource(file: string, src: string): ActionReport | null {
  const action = extractAction(src)
  if (action == null) return null
  const reachable = reachableSource(action, collectLocalFunctions(src))
  if (collectEnforcedPermissions(reachable).size > 0) return { file, enforced: true, via: 'body' }
  if (delegatesTo(reachable).length > 0) return { file, enforced: true, via: 'delegate' }
  if (ALLOWLIST[file]) return { file, enforced: true, via: 'allowlist' }
  return { file, enforced: false, via: 'none' }
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function main(): void {
  const json = process.argv.includes('--json')
  const files = SCAN_DIRS.flatMap(dir => walk(join(ROOT, dir), []))
    .map(full => relative(ROOT, full))
    .filter(file => ROUTE_FILE_RE.test(file) && !TEST_FILE_RE.test(file))

  const reports = files
    .map(file => checkActionSource(file, readFileSync(join(ROOT, file), 'utf8')))
    .filter((report): report is ActionReport => report != null)

  const brokenDelegates = Object.entries(DELEGATES)
    .filter(([, { file, enforces }]) => !enforces.test(readFileSync(join(ROOT, file), 'utf8')))
    .map(([name, { file }]) => `${name} (${file})`)
  const staleAllowlist = Object.keys(ALLOWLIST).filter(file => !reports.some(report => report.file === file))
  const missing = reports.filter(report => !report.enforced)

  if (json) {
    process.stdout.write(`${JSON.stringify({ reports, missing, brokenDelegates, staleAllowlist }, null, 2)}\n`)
    process.exit(missing.length + brokenDelegates.length + staleAllowlist.length > 0 ? 1 : 0)
  }

  if (missing.length > 0) {
    process.stderr.write(`\n❌ ${missing.length} route action(s) enforce no permission:\n`)
    for (const { file } of missing) process.stderr.write(`  ${file}\n`)
    process.stderr.write(
      "\nA layout loader's gate does not apply to a child's action. Enforce the permission in the action\n" +
        '(`requirePermission(permissions, Permission.X)`), or add it to ALLOWLIST with the reason it is open.\n',
    )
  }
  if (brokenDelegates.length > 0) {
    process.stderr.write(`\n❌ Delegate(s) no longer enforcing a permission: ${brokenDelegates.join(', ')}\n`)
  }
  if (staleAllowlist.length > 0) {
    process.stderr.write(`\n❌ ALLOWLIST entries with no route action: ${staleAllowlist.join(', ')}\n`)
  }
  if (missing.length + brokenDelegates.length + staleAllowlist.length > 0) process.exit(1)

  process.stdout.write(`✅ ${reports.length} route action(s) checked — each enforces a permission or is allowlisted.\n`)
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) {
  main()
}
