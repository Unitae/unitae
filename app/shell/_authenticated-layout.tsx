import { useEffect } from 'react'
import { data, redirect } from 'react-router'
import { toast } from 'sonner'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { DemoBanner } from '~/features/demo'
import { demoRoleOf, isDemoCongregation, refusedInDemoCopy, touchDemoCopy } from '~/features/demo/index.server'
import { answersForASchedule } from '~/features/events/index.server'
import { HelpAccessProvider, HelpPanel } from '~/features/help'
import { helpReaderFor, visibleHelpSlugsFor } from '~/features/help/index.server'
import { helpLocaleFor } from '~/features/help/model/help-links'
import { settingsLinksFor } from '~/features/settings'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { requireAuth } from '~/shared/auth/middleware.server'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getHostSettings } from '~/shared/domain/host-settings.server'
import { getTrialBanner } from '~/shared/domain/trial-banner.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { AppLayout } from '~/shared/ui/AppLayout'
import { OutsideAppError } from '~/shared/ui/OutsideAppError'
import { RouteErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
import { readSidebarOpenFromCookie } from '~/shared/ui/sidebar/sidebar-cookie'
import { formatPersonName, resolveAccountName } from '~/shared/utils/format-person-name'

import type { Route } from './+types/_authenticated-layout'

// Opening, closing or swapping the « ? » article changes only `?help=`: the page keeps its data.
export { skipRevalidationForHelpPanel as shouldRevalidate } from '~/features/help'

/** The pattern React Router reports for the catch-all route of this layout. */
const UNKNOWN_ADDRESS = '*'

/**
 * An unknown address (the catch-all at the end of this layout): someone signed in gets the 404 inside the shell; a
 * visitor gets the plain 404 page, with its status, rather than being sent to sign in for a page that does not exist.
 * Runs before `requireAuth`, whose redirect would otherwise answer first.
 */
const notFoundForVisitors: Route.MiddlewareFunction = async ({ request, pattern }, next) => {
  if (pattern === UNKNOWN_ADDRESS) {
    const session = await getSession(request.headers.get('Cookie'))
    if (!session.get('userId')) throw new Response(null, { status: 404, statusText: 'Not Found' })
  }
  return next()
}

/**
 * A visitor's demo copy, on every request after `requireAuth` has resolved the
 * congregation, client-side navigation included: it turns away files, changes to the logins, invitations and the
 * congregation's archive, back to the page with the reason; and it pushes the copy's expiry, an hour on.
 */
const demoCopyGuard: Route.MiddlewareFunction = async ({ request, context }, next) => {
  const congregation = context.get(congregationContext)
  if (!isDemoCongregation(congregation)) return next()
  if (await refusedInDemoCopy(request)) {
    const session = await getSession(request.headers.get('Cookie'))
    session.flash('error', m.demo_refused())
    throw redirect(sameOriginPath(request), { headers: { 'Set-Cookie': await commitSession(session) } })
  }
  // Best effort: a failed push costs the copy an hour at worst, never the page.
  await touchDemoCopy(congregation).catch(error => logger.warn('Demo copy expiry not pushed', { error }))
  return next()
}

/** The page the visitor submitted from, on this site; the dashboard otherwise. */
function sameOriginPath(request: Request): string {
  const referer = request.headers.get('Referer')
  if (!referer) return '/'
  try {
    const url = new URL(referer)
    return url.origin === new URL(request.url).origin ? `${url.pathname}${url.search}` : '/'
  } catch {
    return '/'
  }
}

export const middleware: Route.MiddlewareFunction[] = [
  notFoundForVisitors,
  requireAuth([
    Permission.CanDoAnything,
    Permission.CanViewBoard,
    Permission.CanUploadBoardDocuments,
    Permission.CanReviewBoardDocuments,
    Permission.CanViewPublishers,
    Permission.CanManagePublishers,
    Permission.CanViewTerritories,
    Permission.CanManageTerritories,
    Permission.CanViewProspection,
    Permission.CanRecordProspection,
    Permission.CanManageUsers,
    Permission.CanViewPrograms,
    Permission.CanManagePrograms,
    Permission.CanViewAbsences,
    Permission.CanViewActivity,
    Permission.CanRecordActivity,
    Permission.CanSetPioneerGoals,
    Permission.CanViewExternalSpeakers,
    Permission.CanManageExternalSpeakers,
    Permission.CanViewRoles,
    Permission.CanManageRoles,
    Permission.CanConfigurePermissions,
  ]),
  demoCopyGuard,
]

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)
  const permissions = context.get(permissionsContext)
  const session = await getSession(request.headers.get('Cookie'))

  const can = (role: Permission) => permissions.has(role)
  const settingsLinks = settingsLinksFor({ permissions })
  const messages = { success: session.get('success'), error: session.get('error') }
  // Reading the sidebar cookie here keeps a collapsed sidebar collapsed
  // across full page loads.
  const sidebarOpen = readSidebarOpenFromCookie(request.headers.get('Cookie'))
  // A visitor's demo copy: the banner says who they are (the middleware pushes its expiry).
  const demo = isDemoCongregation(congregation)
    ? {
        role: await withScopeFromContext(context, (db, congregationId) =>
          demoRoleOf(db, congregationId, currentUser.id),
        ),
        registerUrl: getHostSettings().demo?.registerUrl ?? null,
      }
    : null

  return data(
    {
      permissions: {
        canViewBoard: can(Permission.CanViewBoard),
        canUploadDocument: can(Permission.CanUploadBoardDocuments),
        canManageBoard: can(Permission.CanReviewBoardDocuments),
        canConfigureBoardSections: can(Permission.CanConfigureBoardSections),
        canOrganiseBoardDocuments: can(Permission.CanOrganiseBoardDocuments),
        canManageDynamicBoardDocuments: can(Permission.CanManageDynamicBoardDocuments),
        canViewPublishers: can(Permission.CanViewPublishers),
        canViewTerritories: can(Permission.CanViewTerritories),
        canViewAttributions: can(Permission.CanViewTerritoryAttributions),
        canManageCampaigns: can(Permission.CanManageTerritoryCampaigns),
        canViewProspection: can(Permission.CanViewProspection),
        canManageTerritories: can(Permission.CanManageTerritories),
        canViewPrograms: can(Permission.CanViewPrograms),
        canViewAbsences: can(Permission.CanViewAbsences),
        canViewActivity: can(Permission.CanViewActivity),
        canViewExternalSpeakers: can(Permission.CanViewExternalSpeakers) || can(Permission.CanManageExternalSpeakers),
        canManageExternalSpeakers: can(Permission.CanManageExternalSpeakers),
        canEnterAttendance:
          can(Permission.CanRecordAttendance) ||
          can(Permission.CanCorrectAttendance) ||
          can(Permission.CanViewAttendance),
        canViewRoles: can(Permission.CanViewRoles) || can(Permission.CanManageRoles),
        canManageRoles: can(Permission.CanManageRoles),
        settingsLinks,
        ledGroupId: currentUser.member?.responsibleFor?.id ?? currentUser.member?.deputyFor?.id ?? null,
      },
      congregationName: congregation.displayName ?? congregation.name,
      userName: formatPersonName(resolveAccountName(currentUser), currentUser.email ?? ''),
      demo,
      trial: getTrialBanner(congregation, {
        canSubscribe: can(Permission.CanConfigureCongregation),
        locale: getLocale(),
        now: new Date(),
      }),
      messages,
      sidebarOpen,
      helpSlugs: visibleHelpSlugsFor(
        helpReaderFor(
          permissions,
          currentUser,
          // Only for a reader the programmes' rights do not already let in: no query for the managers.
          !can(Permission.CanManagePrograms) &&
            !can(Permission.CanPublishPrograms) &&
            !can(Permission.CanAssignProgramParts) &&
            (await withScopeFromContext(context, (db, congregationId) =>
              answersForASchedule(db, currentUser.id, congregationId),
            )),
        ),
        helpLocaleFor(getLocale()),
      ),
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function AuthenticatedLayout({ loaderData }: Route.ComponentProps) {
  const { permissions, congregationName, userName, demo, trial, messages, sidebarOpen, helpSlugs } = loaderData

  useEffect(() => {
    if (messages.success) {
      toast.success(messages.success)
    }
    if (messages.error) {
      toast.error(messages.error)
    }
  }, [messages])

  return (
    <HelpAccessProvider slugs={helpSlugs}>
      <AppLayout
        permissions={permissions}
        congregationName={congregationName}
        userName={userName}
        trial={trial}
        demoBanner={<DemoBanner demo={demo} />}
        sidebarOpen={sidebarOpen}
        helpPanel={<HelpPanel />}
      />
    </HelpAccessProvider>
  )
}

/**
 * An error on a page keeps the shell: the layout's own data loaded, so the sidebar is drawn around the error. When
 * the layout itself failed there is no shell to keep, and the error goes on the frame of the pages outside the app.
 */
export function ErrorBoundary({ loaderData }: Route.ErrorBoundaryProps) {
  if (loaderData == null) return <OutsideAppError />
  const { permissions, congregationName, userName, demo, trial, sidebarOpen } = loaderData
  return (
    <AppLayout
      permissions={permissions}
      congregationName={congregationName}
      userName={userName}
      trial={trial}
      demoBanner={<DemoBanner demo={demo} />}
      sidebarOpen={sidebarOpen}
    >
      <RouteErrorBoundary />
    </AppLayout>
  )
}
