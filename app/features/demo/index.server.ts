// Server-only boundary of the demo feature (docs/development/specs/demo-mode.md).

export { demoRoleOf, touchDemoCopy } from './server/demo-copy.server'
export { refusedInDemoCopy } from './server/demo-guard.server'
export { isDemoCongregation, isDemoModeEnabled, nextDemoExpiry } from './server/demo-mode.server'
export { consumeDemoSignInToken, demoAccountFor } from './server/demo-sign-in.server'
export { seedPendingDemoCopies } from './server/seed-demo-copies.server'
