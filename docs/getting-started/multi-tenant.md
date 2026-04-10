# Multi-Congregation Deployment

Run a single Unitae instance for multiple congregations. Each congregation gets its own subdomain (or custom domain) and its data is completely isolated from other congregations.

This is useful for circuits, regions, or associations that manage several congregations and want a single infrastructure to maintain.

## How It Works

When multi-tenant mode is enabled:

- Each congregation is identified by a **slug** (e.g., `lyon`, `paris-nord`)
- Congregations are accessed via subdomains: `lyon.your-domain.com`, `paris-nord.your-domain.com`
- Congregations can also use custom domains (configured per congregation)
- All data (users, territories, publishers, documents) is strictly isolated between congregations
- A `/register` page becomes available for creating new congregations

## Prerequisites

- Everything from the [self-hosted deployment](self-hosted.md)
- A domain name with wildcard DNS (e.g., `*.unitae.example.com` pointing to your server)
- A reverse proxy capable of handling wildcard TLS certificates (Caddy, Traefik, or Nginx with Let's Encrypt)

## Configuration

Add these environment variables to your `.env` file, in addition to the ones from the self-hosted guide:

```ini
# Enable multi-tenant mode
MULTI_TENANT=true

# Your root domain (subdomains will be resolved from this)
APP_BASE_URL=https://unitae.example.com

# Cookie domain (must match the root domain for cross-subdomain sessions)
COOKIE_DOMAIN=.unitae.example.com
```

## Docker Compose Setup

Use the same `docker-compose.yml` as the [self-hosted deployment](self-hosted.md). The only difference is the extra environment variables above.

```bash
docker compose up -d
docker compose exec web pnpm prisma migrate deploy
docker compose exec web pnpm tsx app/database/seed.ts
```

## PM2 Setup

Same as the [self-hosted PM2 setup](self-hosted.md#pm2-direct-nodejs) with the extra environment variables.

## Creating Congregations

### First Congregation

Visit your root domain (e.g., `https://unitae.example.com`). The setup wizard creates the first congregation and its admin user.

### Additional Congregations

Once the first congregation exists, new congregations can be created by visiting `/register`. This page is only available when `MULTI_TENANT=true`.

The registration form asks for:
- **Congregation name** — The display name (e.g., "Lyon Centre")
- **Admin email** — The email address for the first admin user
- **Password** — The admin user's password

A slug is automatically generated from the congregation name (e.g., "Lyon Centre" becomes `lyon-centre`). The new congregation will be accessible at `lyon-centre.your-domain.com`.

## Reverse Proxy

Your reverse proxy must handle wildcard routing. All subdomains should point to the Unitae web service on port 8080.

Example with **Caddy** (automatic wildcard TLS):

```
*.unitae.example.com {
    reverse_proxy localhost:8080
}
```

Example with **Nginx** (requires separate wildcard certificate):

```nginx
server {
    listen 443 ssl;
    server_name *.unitae.example.com;

    ssl_certificate /path/to/wildcard.crt;
    ssl_certificate_key /path/to/wildcard.key;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Data Isolation

Each congregation's data is completely isolated at the database level. All queries are automatically scoped to the current congregation — there is no way for one congregation to access another's data through the application.

See [Security](../core-concepts/security.md) for more details on the isolation model.

## Next Steps

- [Self-Hosting vs unitae.app](../hosting/self-hosting-vs-managed.md) — Compare self-hosting with the managed service
- [Requirements](../hosting/requirements.md) — Resource recommendations for multi-congregation deployments
- [Environment Variables](../technical-reference/environment-variables.md) — Full configuration reference
