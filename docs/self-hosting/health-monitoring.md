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
restarts every web pod at once when PostgreSQL or Redis stays unreachable for a few probe periods,
which brings neither back; readiness only takes the pods out of the load balancer until the
dependencies answer again.

Neither endpoint needs to be public: the orchestrator reaches them on the container port.

The web process checks the database itself once, when it starts: outside development it exits if it
cannot verify that Row-Level Security is enforced (see
[Row-Level Security](../development/row-level-security.md)). An instance started while PostgreSQL is
unreachable exits before `/livez` can answer; with a restart policy it comes back once the database
does.

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
      # The runtime image has no curl: Node's own fetch does the probe.
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://localhost:8080/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
```

Compose reports this status and uses it to order `depends_on`; it does not restart an unhealthy
container. If your setup does (Docker Swarm, an autoheal sidecar), probe `/livez` instead, for the
reason given above.

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
  periodSeconds: 10
```

## Background Worker

The worker process runs its own HTTP health server, separate from the web application.

The port is configurable via `UNITAE_WORKER_HEALTH_PORT` (default `9090`).

### `GET /livez` (port 9090) — liveness

- **200 OK** — The process is up and not shutting down
- **503** — The worker is shutting down

Use it for liveness probes. It deliberately ignores Redis and the schedulers, so a restart loop never stops a worker that is still processing its queues.

### `GET /health` (port 9090) — readiness

- **200 OK** — Every queue worker has connected, and both daily schedulers (retention and campaign lifecycle) are registered
- **503 Not Ready** — A worker is not connected yet, a scheduler is not registered yet (registration retries with backoff and logs each failure), or the worker is shutting down

`GET /` answers the same as `/health`.

### Docker Compose healthcheck

Compose only reports health, it does not restart unhealthy containers, so check readiness. The image has no `curl`; use Node:

```yaml
services:
  worker:
    # ...
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:9090/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

A worker that stays unhealthy while its logs repeat `Failed to register the … scheduler` is processing jobs, but its daily sweeps (including data retention) are not scheduled. Check Redis.

### Kubernetes probes

```yaml
livenessProbe:
  httpGet:
    path: /livez
    port: 9090
  initialDelaySeconds: 15
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /health
    port: 9090
  initialDelaySeconds: 10
  periodSeconds: 10
```

## Related

- [Environment Variables](environment-variables.md) — `UNITAE_WEB_PORT`, `UNITAE_WORKER_HEALTH_PORT`
- [Cron Jobs](cron-jobs.md) — Recurring maintenance endpoints
- [Background Processing](../development/background-processing.md) — Worker architecture details
