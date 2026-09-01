import { assertIntegrationDatabases } from './assert-test-database'

// Runs once per integration test file, before anything constructs a Prisma client. It lives in
// the vitest config rather than in each suite because these tests each build their own client —
// there is no single module they all go through to guard.
assertIntegrationDatabases({ dbUrl: process.env.DB_URL, runtimeUrl: process.env.DB_RUNTIME_URL })
