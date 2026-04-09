import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    // biome-ignore lint/style/noNonNullAssertion: required by Prisma config, validated at app startup
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    seed: 'pnpm tsx app/database/seed.ts',
  },
  schema: path.join(__dirname, 'app', 'database', 'schema.prisma'),
})
