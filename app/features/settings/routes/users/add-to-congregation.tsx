import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { z } from 'zod'
import { commitSession, getSession } from '~/features/authentication'
import { linkMemberToAccount } from '~/features/settings/server/link-member-to-account.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { AccountId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
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
})

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_user_add_to_congregation_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.SettingsUserManager)
  requirePermission(permissions, Permission.PublisherManager)

  const accountId = requireParamId<AccountId>(params.accountId, '/settings/users')

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

export default function AddToCongregationPage({ loaderData, actionData }: Route.ComponentProps) {
  const { account } = loaderData
  useFocusError(actionData)

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: addToCongregationSchema })
    },
  })

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

      <Form method="post" {...getFormProps(form)} className="flex max-w-xl flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={fields.firstname.id}>{m.settings_user_new_firstname_label()}</Label>
            <Input
              {...getInputProps(fields.firstname, { type: 'text' })}
              key={fields.firstname.id}
              defaultValue={account.firstname ?? ''}
              required
            />
            {fields.firstname.errors && <p className="text-destructive text-sm">{fields.firstname.errors}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fields.lastname.id}>{m.settings_user_new_lastname_label()}</Label>
            <Input
              {...getInputProps(fields.lastname, { type: 'text' })}
              key={fields.lastname.id}
              defaultValue={account.lastname ?? ''}
              required
            />
            {fields.lastname.errors && <p className="text-destructive text-sm">{fields.lastname.errors}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={fields.gender.id}>{m.publishers_view_gender_label()}</Label>
          {/* No default — picking gender drives isMale, which gates elder/servant fields downstream. */}
          <Select name="gender" required>
            <SelectTrigger id={fields.gender.id}>
              <SelectValue placeholder={m.publishers_view_gender_label()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">{m.publishers_view_gender_male()}</SelectItem>
              <SelectItem value="female">{m.publishers_view_gender_female()}</SelectItem>
            </SelectContent>
          </Select>
          {fields.gender.errors && <p className="text-destructive text-sm">{fields.gender.errors}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={fields.birthDate.id}>{m.publishers_view_birth_date_label()}</Label>
            <Input {...getInputProps(fields.birthDate, { type: 'date' })} key={fields.birthDate.id} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fields.baptismDate.id}>{m.publishers_view_baptism_date_label()}</Label>
            <Input {...getInputProps(fields.baptismDate, { type: 'date' })} key={fields.baptismDate.id} />
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

  const accountId = requireParamId<AccountId>(params.accountId, '/settings/users')
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
        type: PublisherType.Normal,
        isHelder: false,
        isServant: false,
        isAnointed: false,
        publisherGroupId: null,
        phone: '',
        address: '',
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
