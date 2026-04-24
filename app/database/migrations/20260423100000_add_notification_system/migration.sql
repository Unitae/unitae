-- CreateTable: NotificationEvent (debounce buffer for notification system)
CREATE TABLE "NotificationEvent" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "recipientId" INTEGER,
    "recipientRole" TEXT,
    "actorId" INTEGER,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "debounceKey" TEXT NOT NULL,
    "debounceUntil" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationEvent_status_debounceUntil_idx" ON "NotificationEvent"("status", "debounceUntil");
CREATE INDEX "NotificationEvent_debounceKey_status_idx" ON "NotificationEvent"("debounceKey", "status");
CREATE INDEX "NotificationEvent_congregationId_status_idx" ON "NotificationEvent"("congregationId", "status");
CREATE UNIQUE INDEX "NotificationEvent_id_congregationId_key" ON "NotificationEvent"("id", "congregationId");

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "NotificationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationEvent" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

-- CreateTable: NotificationPreference (user opt-out for notifications)
CREATE TABLE "NotificationPreference" (
    "id" SERIAL NOT NULL,
    "notificationType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_notificationType_congregationId_key" ON "NotificationPreference"("userId", "notificationType", "congregationId");
CREATE UNIQUE INDEX "NotificationPreference_id_congregationId_key" ON "NotificationPreference"("id", "congregationId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationPreference" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );
