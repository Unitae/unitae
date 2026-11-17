import { index, prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const helpRoutes = [
  ...prefix('help', [index('features/help/routes/index.tsx'), route(':slug', 'features/help/routes/article.tsx')]),
] satisfies RouteConfig
