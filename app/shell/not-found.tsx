// Catch-all, registered last in app/routes.ts. When no route matches, React Router answers the 404
// before any middleware runs, so the page left without the security headers (and its scripts
// without the CSP nonce) that the root route gives every other response. Matching here runs the
// root middleware and loader; the root ErrorBoundary still renders the page.
function notFound(): never {
  throw new Response(null, { status: 404, statusText: 'Not Found' })
}

export function loader() {
  notFound()
}

// Without it, a form posted to an unknown path would answer 405 instead of 404.
export function action() {
  notFound()
}

// Never rendered. Without a component this would be a resource route, and the 404 would leave as
// an empty response instead of the root ErrorBoundary's page.
export default function NotFound() {
  return null
}
