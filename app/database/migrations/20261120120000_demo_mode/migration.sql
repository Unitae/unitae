-- Demo mode (docs/development/specs/demo-mode.md): a congregation can be a visitor's short-lived demo copy, entered
-- through a one-time link. Additive only: every existing congregation keeps both columns null.

ALTER TABLE "Congregation" ADD COLUMN "demoExpiresAt" TIMESTAMP(3),
ADD COLUMN "demoReadyAt" TIMESTAMP(3);

CREATE TABLE "DemoSignInToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "DemoSignInToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemoSignInToken_token_key" ON "DemoSignInToken"("token");
CREATE INDEX "DemoSignInToken_congregationId_idx" ON "DemoSignInToken"("congregationId");

ALTER TABLE "DemoSignInToken" ADD CONSTRAINT "DemoSignInToken_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security — same shape as every other tenant-scoped table (CASE form guards the ::int cast against an empty
-- string on a pooled connection, see 20260426000000_fix_rls_policy_cast_safety). The hosted service's control plane
-- writes a token unscoped; /demo/enter spends it scoped to the host's congregation, before any session exists.
ALTER TABLE "DemoSignInToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DemoSignInToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DemoSignInToken" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
