// Production server: what `react-router-serve` does, plus `trust proxy`.
//
// TLS usually ends at a reverse proxy in front of the app (nginx, Caddy, an ingress),
// which forwards plain HTTP with `X-Forwarded-Proto: https`. React Router (since 8.3.1) rejects an action whose
// `Origin` does not match the request URL, scheme included, and the Express adapter
// builds that URL from `req.protocol`, which ignores `X-Forwarded-Proto` unless
// `trust proxy` is on. Without it every form submission is refused with a 400.
// Only proxies on loopback or private networks are trusted (a sidecar, a container on the
// same Docker network, an ingress pod): a client reaching the app port directly cannot
// choose the scheme or host the app sees.
import path from 'node:path'
import url from 'node:url'
import { createRequestHandler } from '@react-router/express'
import compression from 'compression'
import express from 'express'
import morgan from 'morgan'

const build = await import(url.pathToFileURL(path.resolve('build/server/index.js')).href)
const assetsDirectory = path.resolve(build.assetsBuildDirectory)
const port = Number(process.env.PORT) || 3000

const app = express()
app.set('trust proxy', 'loopback, linklocal, uniquelocal')
app.disable('x-powered-by')
app.use(compression())
app.use('/assets', express.static(path.join(assetsDirectory, 'assets'), { immutable: true, maxAge: '1y' }))
app.use(express.static(assetsDirectory))
app.use(express.static('public', { maxAge: '1h' }))
app.use('/.well-known', express.static(path.join(assetsDirectory, '.well-known')))
app.use(morgan('tiny'))
app.all('/{*splat}', createRequestHandler({ build, mode: process.env.NODE_ENV }))

const server = app.listen(port, () => {
  process.stdout.write(`Server listening on http://localhost:${port}\n`)
})
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => server.close())
}
