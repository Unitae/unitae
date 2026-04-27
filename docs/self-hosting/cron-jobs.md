# Cron Jobs

Unitae exposes HTTP endpoints for recurring maintenance tasks. These endpoints must be called on a schedule by an external scheduler (cron, systemd timer, Kubernetes CronJob, etc.).

## Authentication

All cron endpoints require a `UNITAE_CRON_SECRET` environment variable. Requests must include it as a Bearer token:

```
Authorization: Bearer <your-cron-secret>
```

If `UNITAE_CRON_SECRET` is not set, all cron endpoints return `401 Unauthorized`.

## Endpoints

### `GET /cron/retention`

Cleans up expired data to comply with retention policies:

- Expired password reset tokens (older than 24h)
- Withdrawn consent records past their retention period

**Recommended schedule**: Once per day (e.g., `0 3 * * *`)

### `GET /cron/board-expirations`

Checks for display board documents approaching their visibility end date and sends notification emails to board validators.

**Recommended schedule**: Once per day (e.g., `0 7 * * *`)

### `GET /cron/process-notifications`

Flushes settled notification events. Notifications with a debounce window are buffered in the database; this endpoint picks up events whose debounce period has elapsed, resolves recipients based on notification preferences, and pushes email jobs to the background queue.

**Recommended schedule**: Every 5 to 10 minutes (e.g., `*/5 * * * *`)

## Response Format

All endpoints return JSON:

```json
{ "ok": true, "cleaned": { ... } }
```

On authentication failure: `{ "error": "Unauthorized" }` with status `401`.

## Setup Examples

### crontab

```bash
UNITAE_CRON_SECRET="your-secret-here"
UNITAE_BASE_URL="http://localhost:8080"

# Retention cleanup — daily at 3:00 AM
0 3 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/cron/retention"

# Board expiration check — daily at 7:00 AM
0 7 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/cron/board-expirations"

# Notification flush — every 5 minutes
*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/cron/process-notifications"
```

### systemd timer

Create a service unit (e.g., `/etc/systemd/system/unitae-retention.service`):

```ini
[Unit]
Description=Unitae retention cleanup

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -s -H "Authorization: Bearer %d/cron-secret" http://localhost:8080/cron/retention
```

And a timer unit (`/etc/systemd/system/unitae-retention.timer`):

```ini
[Unit]
Description=Run Unitae retention cleanup daily

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

### Docker Compose

If you run Unitae with Docker Compose, you can call the endpoints from the host or add a lightweight sidecar. From the host:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:8080/cron/retention
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: unitae-retention
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: curl
              image: curlimages/curl:latest
              command:
                - curl
                - -sf
                - -H
                - "Authorization: Bearer $(CRON_SECRET)"
                - http://unitae-web:8080/cron/retention
              envFrom:
                - secretRef:
                    name: unitae-cron
          restartPolicy: OnFailure
```

## Related

- [Environment Variables](environment-variables.md) — `UNITAE_CRON_SECRET` configuration
- [Health Monitoring](health-monitoring.md) — Health check endpoints
- [Background Processing](../development/background-processing.md) — How background jobs work
