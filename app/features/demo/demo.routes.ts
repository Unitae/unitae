import { type RouteConfig, route } from '@react-router/dev/routes'

/** Outside the signed-in layout: the one-time link signs the visitor in. */
export const demoEntryRoutes = [route('demo/enter', 'features/demo/routes/enter.tsx')] satisfies RouteConfig

/** Inside the signed-in layout: switching role in a demo copy. */
export const demoRoutes = [route('demo/role', 'features/demo/routes/switch-role.tsx')] satisfies RouteConfig
