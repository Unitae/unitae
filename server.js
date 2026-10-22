// Production server: what `react-router-serve` does, with Express `trust proxy` on.
//
// TLS usually ends at a reverse proxy in front of the app (nginx, Caddy, an ingress), which
// forwards plain HTTP with `X-Forwarded-Proto: https`. React Router (since 8.3.1) refuses an
// action whose `Origin` does not match the request URL, scheme included, and the Express adapter
// builds that URL from `req.protocol`, which ignores `X-Forwarded-Proto` unless `trust proxy` is
// on. Without it every form submission behind HTTPS fails with a 400.
//
// `X-Forwarded-*` is honoured only when the TCP peer is on loopback or a private network, or as
// configured by UNITAE_TRUST_PROXY (Express `trust proxy` syntax). That is not an authentication
// boundary, and `Host` is always chosen by the client: never build absolute URLs from
// `request.url`, use UNITAE_BASE_URL.
import path from 'node:path'
import url from 'node:url'
import compression from 'compression'
import express from 'express'
import morgan from 'morgan'

// React and the app build read NODE_ENV once, when they load (development React, non-secure
// cookies), so default it before importing either. A static import would run before this line.
process.env.NODE_ENV ??= 'production'
const { createRequestHandler } = await import('@react-router/express')
const build = await import(url.pathToFileURL(path.resolve('build/server/index.js')).href)

const assetsDirectory = path.resolve(build.assetsBuildDirectory)
const port = Number(process.env.PORT) || 3000

const HOP_COUNT = /^\d+$/

// `true`, a hop count, or a comma-separated list of addresses, subnets and preset names.
function parseTrustProxy(value) {
  if (!value) return 'loopback, linklocal, uniquelocal'
  if (value === 'true' || value === 'false') return value === 'true'
  return HOP_COUNT.test(value) ? Number(value) : value
}

const app = express()
app.set('trust proxy', parseTrustProxy(process.env.UNITAE_TRUST_PROXY))
app.disable('x-powered-by')
app.use(compression())
app.use('/assets', express.static(path.join(assetsDirectory, 'assets'), { immutable: true, maxAge: '1y' }))
app.use(express.static(assetsDirectory))
app.use(express.static('public', { maxAge: '1h' }))
app.use('/.well-known', express.static(path.join(assetsDirectory, '.well-known')))
app.use(morgan('tiny'))
app.all('/{*splat}', createRequestHandler({ build, mode: process.env.NODE_ENV }))

// Express 5 hands a bind failure (port taken, no permission) to this callback instead of throwing:
// rethrow it, or the process would report success while serving nothing.
const server = app.listen(port, error => {
  if (error) throw error
  process.stdout.write(`Server listening on http://localhost:${port}\n`)
})
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () =>
    server.close(error => {
      if (error) process.stderr.write(`${error.stack ?? error}\n`)
    }),
  )
}
