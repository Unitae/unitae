import { prefix, type RouteConfig, route } from '@react-router/dev/routes'

export const authenticationRoutes = [
  route('login', 'features/authentication/routes/login.tsx'),
  route('logout', 'features/authentication/routes/logout.tsx'),
  route('register', 'features/authentication/routes/register.tsx'),
  route('setup', 'features/authentication/routes/setup.tsx'),
  route('verify-email', 'features/authentication/routes/verify-email.tsx'),
  route('verify-email/:token', 'features/authentication/routes/verify-email-confirm.tsx'),
  ...prefix('password', [
    route(':userHash/reset', 'features/authentication/routes/password-reset.tsx'),
    route(':userId/invalidate', 'features/authentication/routes/password-invalidation.tsx'),
    route('forgot', 'features/authentication/routes/password-forgot.tsx'),
  ]),
] satisfies RouteConfig
