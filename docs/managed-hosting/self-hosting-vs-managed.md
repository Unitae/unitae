# Self-Hosting vs unitae.app

Unitae can be self-hosted on your own infrastructure or used through the managed hosting service at [unitae.app](https://unitae.app). Both options run the exact same open-source code — the difference is who manages the infrastructure.

## Comparison

| | unitae.app | Self-Hosted |
|---|---|---|
| **Setup** | Sign up and start using | Install Docker, configure, deploy |
| **Updates** | Automatic | Pull new images and restart |
| **Backups** | Included | Your responsibility |
| **TLS (HTTPS)** | Included | Reverse proxy setup required |
| **Data location** | MindsersIT infrastructure (EU) | Your infrastructure |
| **Features** | All features | All features (same code) |
| **GDPR compliance** | DPA provided by MindsersIT | Your responsibility (built-in tools included) |
| **Resource limits** | Per plan | Unlimited by default |
| **Multi-congregation** | Built-in | Enable with `MULTI_TENANT=true` |
| **Support** | Included | Community / self |
| **Cost** | Monthly subscription | Your infrastructure costs |

## When to Choose unitae.app

- You want to get started immediately without managing infrastructure
- You prefer automatic updates and managed backups
- You don't have the technical resources to maintain a server
- You want direct support from the team that builds Unitae
- You want GDPR compliance handled for you (DPA, sub-processor management, breach procedures, data hosted in the EU)

## When to Self-Host

- You need full control over your data and where it is stored
- You want to run Unitae on your own hardware or cloud provider
- You want unlimited resources without any plan-based limits
- You are comfortable managing a server, database, and reverse proxy
- You want to customize or extend Unitae for your specific needs
- You are prepared to handle your own GDPR compliance (the built-in tools are available but you are the data controller)

## Switching

### From Self-Hosted to unitae.app

Contact the MindsersIT team through [unitae.app](https://unitae.app) for migration assistance.

### From unitae.app to Self-Hosted

You can export your data and set up a self-hosted instance at any time. Your data belongs to you.

## Next Steps

- [Get started with managed hosting](getting-started.md) — Sign up at unitae.app
- [Self-hosting guide](../self-hosting/getting-started.md) — Deploy on your own infrastructure
- [Self-hosting requirements](../self-hosting/requirements.md) — What you need to run Unitae yourself
