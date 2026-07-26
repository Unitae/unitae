/**
 * Asserts that an import `storageKey` is one the given congregation could
 * legitimately have produced at upload time.
 *
 * The confirm action reads `storageKey` straight from the submitted form, so an
 * Admin can tamper with it. Upload always mints keys via
 * `buildStorageKey(congregationId, 'imports', `${uuid}.unitae`)`
 * (see `import.tsx`), i.e. `${congregationId}/imports/<uuid>.unitae`. Anything
 * else — another tenant's prefix, a `..` traversal, an absolute path, a
 * different bucket or extension — is a tampered key and must be refused.
 *
 * `congregationId` is a server-derived positive integer (from the session,
 * never the form), so its string form contains no regex metacharacters and
 * cannot be attacker-influenced — interpolating it into the anchored regex is
 * injection-safe. The `^…$` anchors also block prefix confusion (`420` for
 * congregation `42`) and any trailing path segments.
 */
export function isOwnedImportKey(congregationId: number, storageKey: string): boolean {
  return new RegExp(`^${congregationId}/imports/[0-9a-f-]+\\.unitae$`).test(storageKey)
}
