import { Form, Link, redirect } from 'react-router'
import { changeUserPassword } from '~/features/authentication/server/change-user-password.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'
import { congregationContext, userContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import logger from '~/shared/infra/logger.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import type { Route } from './+types/profile'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.user_profile_page_title()} - Unitae` }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)
  const congregation = context.get(congregationContext)
  const session = await getSession(request.headers.get('Cookie'))
  logger.info(`Loading profile data. User ID: ${currentUser.id}.`)

  return {
    user: {
      id: currentUser.id,
      email: currentUser.email,
      lastname: currentUser.lastname,
      firstname: currentUser.firstname,
      isPublisher: currentUser.isPublisher,
    },
    congregationName: congregation.displayName ?? congregation.name,
    error: session.get('error'),
  }
}

export default function ProfilePage({ loaderData }: Route.ComponentProps) {
  const { user, error, congregationName } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.user_profile_page_title()}
        subtitle={m.user_profile_page_subtitle()}
        breadcrumbs={[{ label: m.sidebar_my_profile() }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.user_profile_account_section()}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground text-sm">{m.user_profile_lastname_label()}</span>
            <span className="font-medium text-sm">{user.lastname?.toLocaleUpperCase() ?? '—'}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground text-sm">{m.user_profile_firstname_label()}</span>
            <span className="font-medium text-sm">{user.firstname ?? '—'}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground text-sm">{m.user_profile_email_label()}</span>
            <span className="font-medium text-sm">{user.email.toLocaleLowerCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">
              {m.user_profile_publisher_label({ congregationName })}
            </span>
            <span className="font-medium text-sm">{user.isPublisher ? m.common_yes() : m.common_no()}</span>
          </div>
          <p className="mt-2 text-muted-foreground text-xs italic">{m.user_profile_contact_group_leader()}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.user_profile_privacy_section()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{m.user_profile_export_data_title()}</p>
              <p className="text-muted-foreground text-xs">{m.user_profile_export_data_description()}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={`/settings/users/${user.id}/export-data`} download>
                {m.user_profile_export_button()}
              </a>
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{m.user_profile_manage_consents_title()}</p>
              <p className="text-muted-foreground text-xs">{m.user_profile_manage_consents_description()}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/me/consents">{m.user_profile_manage_button()}</Link>
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{m.user_profile_notifications_title()}</p>
              <p className="text-muted-foreground text-xs">{m.user_profile_notifications_description()}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/me/notifications">{m.user_profile_manage_button()}</Link>
            </Button>
          </div>

          <div className="border-t pt-4">
            <p className="font-medium text-sm">{m.user_profile_erasure_right_title()}</p>
            <p className="mt-1 text-muted-foreground text-xs">{m.user_profile_erasure_right_description()}</p>
          </div>

          <p className="text-muted-foreground text-xs">
            <Link to="/privacy" className="text-primary hover:underline">
              {m.user_profile_privacy_policy_link()}
            </Link>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.user_profile_change_password_section()}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{m.user_profile_current_password_label()}</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new_password">{m.user_profile_new_password_label()}</Label>
              <Input id="new_password" name="new_password" type="password" autoComplete="new-password" />
            </div>
            <SubmitButton className="w-fit">{m.user_profile_change_password_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const password = formData.get('password')
  const newPassword = formData.get('new_password')

  const isSuccess = await changeUserPassword(currentUser.id, String(password), String(newPassword))

  if (isSuccess) {
    audit({
      action: AuditAction.PasswordChanged,
      congregationId: currentUser.congregationId,
      actorId: currentUser.id,
      entityType: 'User',
      entityId: currentUser.id,
    })
  }

  if (!isSuccess) {
    session.flash('error', m.user_profile_change_password_error())
    return redirect('/me/profile', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return redirect('/profile', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
