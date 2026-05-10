import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { z } from 'zod'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { linkMemberToAccount } from '~/features/settings/server/link-member-to-account.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  requirePermission,
  currentAccountContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/add-to-congregation'

const addToCongregationSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  gender: z.enum(['male', 'female']),
  birthDate: z.string().optional().or(z.literal('')),
  baptismDate: z.string().optional().or(z.literal('')),
  isPublisher: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  type: z.nativeEnum(PublisherType).default(PublisherType.Normal),
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
})

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_user_add_to_congregation_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.SettingsUserManager)
  requirePermission(permissions, Permission.PublisherManager)

  const accountId = requireParamId(params.accountId, '/settings/users')

  return withScopeFromContext(context, async db => {
    const account = await db.userAccount.findUnique({
      where: { id_congregationId: { id: accountId, congregationId: currentUser.congregationId } },
      select: { id: true, email: true, firstname: true, lastname: true, memberId: true },
    })
    if (!account) throw redirect('/settings/users')
    if (account.memberId != null) throw redirect(`/settings/users/${accountId}/edit`)

    return { account }
  })
}

export default function AddToCongregationPage({ loaderData }: Route.ComponentProps) {
  const { account } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_user_add_to_congregation_title()}
        subtitle={m.settings_user_add_to_congregation_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_users(), to: '/settings/users' },
          { label: m.settings_user_add_to_congregation_title() },
        ]}
        backTo={`/settings/users/${account.id}/edit`}
      />

      <Form method="post" className="flex max-w-xl flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="firstname">{m.settings_user_new_firstname_label()}</Label>
            <Input id="firstname" name="firstname" defaultValue={account.firstname ?? ''} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lastname">{m.settings_user_new_lastname_label()}</Label>
            <Input id="lastname" name="lastname" defaultValue={account.lastname ?? ''} required />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gender">{m.publishers_view_gender_label()}</Label>
          <Select name="gender" defaultValue="male">
            <SelectTrigger id="gender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">{m.publishers_view_gender_male()}</SelectItem>
              <SelectItem value="female">{m.publishers_view_gender_female()}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="birthDate">{m.publishers_view_birth_date_label()}</Label>
            <Input id="birthDate" name="birthDate" type="date" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="baptismDate">{m.publishers_view_baptism_date_label()}</Label>
            <Input id="baptismDate" name="baptismDate" type="date" />
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isPublisher" defaultChecked />
          {m.settings_user_add_to_congregation_is_publisher_label()}
        </label>

        <Button type="submit" size="lg" className="self-start">
          {m.settings_user_add_to_congregation_submit()}
        </Button>
      </Form>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)

  requirePermission(permissions, Permission.SettingsUserManager)
  requirePermission(permissions, Permission.PublisherManager)

  const accountId = requireParamId(params.accountId, '/settings/users')
  const submission = parseWithZod(await request.formData(), { schema: addToCongregationSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const account = await db.userAccount.findUnique({
      where: { id_congregationId: { id: accountId, congregationId: currentUser.congregationId } },
      select: { email: true },
    })
    if (!account) throw redirect('/settings/users')

    try {
      await linkMemberToAccount(db, congregation, {
        accountId,
        congregationId: currentUser.congregationId,
        actorId: currentUser.id,
        firstname: submission.value.firstname,
        lastname: submission.value.lastname,
        isMale: submission.value.gender === 'male',
        birthDate: submission.value.birthDate ? new Date(submission.value.birthDate) : null,
        baptismDate: submission.value.baptismDate ? new Date(submission.value.baptismDate) : null,
        isPublisher: submission.value.isPublisher,
        type: submission.value.type,
        isHelder: false,
        isServant: false,
        isAnointed: false,
        publisherGroupId: null,
        phone: submission.value.phone,
        address: submission.value.address,
      })
    } catch (error) {
      if (error instanceof NotFoundError) throw redirect('/settings/users')
      if (error instanceof ConflictError) {
        session.flash('error', m.settings_user_add_to_congregation_error_conflict())
        return redirect(`/settings/users/${accountId}/edit`, {
          headers: { 'Set-Cookie': await commitSession(session) },
        })
      }
      throw error
    }

    session.flash('success', m.settings_user_add_to_congregation_success({ email: account.email }))
    return redirect(`/settings/users/${accountId}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
