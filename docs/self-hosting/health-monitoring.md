# Health Monitoring

Unitae provides health check endpoints for both the web application and the background worker. Use these to configure liveness/readiness probes in your deployment.

## Web Application

### `GET /health`

Checks connectivity to PostgreSQL and Redis.

- **200 OK** — Both services are reachable (`text/plain` body: `OK`)
- **503 Service Unavailable** — One or both checks failed (`text/plain` body: `Service Unavailable`)

The check runs `redis.ping()` and `db.userAccount.count()` in parallel. No authentication required.

### `GET /livez`

Checks nothing but the web process itself: it answers as long as the server can serve a request.

- **200 OK** — `text/plain` body `ok`, `Cache-Control: no-store`

Use it for liveness and startup probes, and `/health` for readiness. A liveness probe on `/health`
restarts every web pod at once when PostgreSQL or Redis is briefly unreachable, which brings neither
back; readiness only takes the pods out of the load balancer until the dependencies answer again.

Neither endpoint needs to be public: the orchestrator reaches them on the container port.

### Example Usage

```bash
curl -sf http://localhost:8080/health
curl -sf http://localhost:8080/livez
```

### Docker Compose healthcheck

```yaml
services:
  web:
    # ...
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

### Kubernetes probes

```yaml
startupProbe:
  httpGet:
    path: /livez
    port: 8080
  periodSeconds: 5
  failureThreshold: 12
livenessProbe:
  httpGet:
    path: /livez
    port: 8080
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Background Worker

The worker process runs its own HTTP health server, separate from the web application.

### `GET /` (port 9090)

- **200 OK** — All queue workers have fired `ready` and none are in a closing state
- **503 Not Ready** — At least one worker is not ready or is shutting down

The port is configurable via `UNITAE_WORKER_HEALTH_PORT` (default `9090`).

### Docker Compose healthcheck

```yaml
services:
  worker:
    # ...
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:9090"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

### Kubernetes probes

```yaml
livenessProbe:
  httpGet:
    path: /
    port: 9090
  initialDelaySeconds: 15
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /
    port: 9090
  initialDelaySeconds: 10
  periodSeconds: 10
```

## Related

- [Environment Variables](environment-variables.md) — `UNITAE_WEB_PORT`, `UNITAE_WORKER_HEALTH_PORT`
- [Cron Jobs](cron-jobs.md) — Recurring maintenance endpoints
- [Background Processing](../development/background-processing.md) — Worker architecture details
