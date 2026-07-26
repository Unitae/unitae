-- Defence-in-depth for tenant isolation (#281): give TerritoryPerimeter and
-- TerritoryCardOverlay an (id, congregationId) compound unique so single-row
-- update/delete can be scoped by congregationId via the id_congregationId key,
-- instead of trusting Row-Level Security alone.

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryPerimeter_id_congregationId_key" ON "TerritoryPerimeter"("id", "congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryCardOverlay_id_congregationId_key" ON "TerritoryCardOverlay"("id", "congregationId");
