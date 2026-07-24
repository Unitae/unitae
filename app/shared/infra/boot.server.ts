// Boot-time validation shared by every server process (web + worker).
// The top-level await means a failed check rejects module evaluation, crashing
// the process so it fails closed rather than serving requests with a broken
// security posture.
import { assertRuntimeRoleEnforcesRls } from '~/shared/infra/rls-guard.server'
import { validateEnv } from '~/shared/utils/env.server'

validateEnv()
await assertRuntimeRoleEnforcesRls()
