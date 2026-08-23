-- Follow-up to 20260823000000_add_publishing_campaigns: that backfill collapsed
-- every congregation's legacy `type = 'campaign'` attributions into ONE synthetic
-- ended campaign named 'Campagne'. Real history usually spans several distinct
-- drives, so split each synthetic campaign into one campaign per date cluster:
-- a gap of more than 30 days between an attribution's start and the latest end
-- seen so far opens a new cluster. Synthetic campaigns are recognized by the
-- exact stamps the backfill wrote (name 'Campagne', activatedAt = startDate,
-- endedAt = endDate) — a campaign that went through the real lifecycle never
-- has activation/end timestamps exactly equal to its day-granular bounds.
-- Single-cluster synthetics are left untouched (splitting would be a rename).
-- One data-modifying CTE chain: temp tables don't survive Prisma's statement
-- execution.

WITH synth AS (
    SELECT id, "congregationId"
    FROM "Campaign"
    WHERE name = 'Campagne'
      AND "activatedAt" = "startDate"
      AND "endedAt" = "endDate"
),
attrs AS (
    SELECT a.id,
           a."congregationId",
           a."campaignId",
           a."startDate",
           COALESCE(a."endDate", a."startDate") AS eff_end
    FROM "Attribution" a
    JOIN synth s ON s.id = a."campaignId"
),
marked AS (
    SELECT attrs.*,
           CASE
               WHEN "startDate" > COALESCE(
                   MAX(eff_end) OVER (
                       PARTITION BY "campaignId"
                       ORDER BY "startDate", id
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                   ),
                   "startDate"
               ) + INTERVAL '30 days'
               THEN 1 ELSE 0
           END AS opens_cluster
    FROM attrs
),
clustered AS (
    SELECT marked.*,
           SUM(opens_cluster) OVER (PARTITION BY "campaignId" ORDER BY "startDate", id) AS cluster
    FROM marked
),
-- Only campaigns that actually split into several clusters are rewritten.
bounds AS (
    SELECT "campaignId",
           "congregationId",
           cluster,
           MIN("startDate") AS cluster_start,
           MAX(eff_end)     AS cluster_end
    FROM clustered
    WHERE "campaignId" IN (
        SELECT "campaignId" FROM clustered GROUP BY "campaignId" HAVING COUNT(DISTINCT cluster) > 1
    )
    GROUP BY "campaignId", "congregationId", cluster
),
-- One already-ended campaign per cluster, named by its period. Cluster bounds
-- within one congregation are disjoint (30-day gaps) and there is only one
-- synthetic campaign per congregation, so (congregationId, startDate, endDate)
-- uniquely identifies the created row for the repointing below.
created AS (
    INSERT INTO "Campaign" ("name", "startDate", "endDate", "activatedAt", "endedAt", "congregationId", "updatedAt")
    SELECT 'Campagne ' || to_char(b.cluster_start, 'MM/YYYY'),
           b.cluster_start,
           b.cluster_end,
           b.cluster_start,
           b.cluster_end,
           b."congregationId",
           CURRENT_TIMESTAMP
    FROM bounds b
    RETURNING id, "congregationId", "startDate", "endDate"
),
repointed AS (
    UPDATE "Attribution" a
    SET "campaignId" = c.id
    FROM clustered lc
    JOIN bounds b
      ON b."campaignId" = lc."campaignId" AND b.cluster = lc.cluster
    JOIN created c
      ON c."congregationId" = b."congregationId"
     AND c."startDate" = b.cluster_start
     AND c."endDate" = b.cluster_end
    WHERE a.id = lc.id
    RETURNING lc."campaignId" AS old_campaign_id
)
-- The split synthetics are now empty (every attribution was repointed; the
-- backfill never paused anything) — drop them.
DELETE FROM "Campaign"
WHERE id IN (SELECT DISTINCT old_campaign_id FROM repointed);
