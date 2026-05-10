import { parseWithZod } from '@conform-to/zod'
import { KeyRound, RotateCcw, UnplugIcon, UserCheck, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { updatePublisherSchema } from '~/features/publishers/schemas/edit-publisher.schema'
import { updateMember } from '~/features/publishers/server/update-member.server'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/shared/ui/dialog'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/edit-publisher'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const result = await db.member.findUnique({
      where: {
        id_congregationId: {
          id: requireParamId(params.publisherId, '/publishers'),
          congregationId: currentUser.congregationId,
        },
      },
      include: { account: { select: { email: true } } },
    })

    if (result == null) throw redirect('/publishers')

    const showAuxiliaryPioneer = await getBoolSetting(
      db,
      CongregationSettingKey.AuxiliaryPioneerProfileActivated,
      currentUser.congregationId,
    )
    const groups = await db.publisherGroup.findMany({ where: { congregationId: currentUser.congregationId } })
    const { account, ...member } = result
    return {
      user: {
        ...member,
        email: account?.email ?? undefined,
      },
      groups,
      hideAuxiliaryPioneer: !showAuxiliaryPioneer,
    }
  })
}

export default function EditPublisher({ loaderData }: Route.ComponentProps) {
  const { user, groups, hideAuxiliaryPioneer } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  const [gender, setGender] = useState<'male' | 'female' | null>(user.isMale ? 'male' : 'female')

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.publishers_edit_title()}
        subtitle={m.publishers_edit_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publishers(), to: '/publishers' }, { label: m.publishers_edit_title() }]}
        backTo="/publishers"
        actions={
          <>
            {user.email == null ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" title={m.publishers_edit_link_login_title()}>
                    <KeyRound className="size-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <Form method="post" action={`/publishers/${user.id}/link-login`}>
                    <DialogHeader>
                      <DialogTitle>{m.publishers_edit_link_login_dialog_title()}</DialogTitle>
                      <DialogDescription>{m.publishers_edit_link_login_dialog_description()}</DialogDescription>
                    </DialogHeader>
                    <div className="my-4 flex flex-col gap-2">
                      <Label htmlFor="link-login-email">{m.publishers_edit_link_login_email_label()}</Label>
                      <Input id="link-login-email" name="email" type="email" required />
                    </div>
                    <DialogFooter>
                      <Button type="submit">{m.publishers_edit_link_login_submit()}</Button>
                    </DialogFooter>
                  </Form>
                </DialogContent>
              </Dialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" title={m.publishers_edit_unlink_login_title()}>
                    <UnplugIcon className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{m.publishers_edit_unlink_login_dialog_title()}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {m.publishers_edit_unlink_login_dialog_description()}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                    <Form method="post" action={`/publishers/${user.id}/unlink-login`}>
                      <AlertDialogAction type="submit">
                        {m.publishers_edit_unlink_login_submit()}
                      </AlertDialogAction>
                    </Form>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {user.leftAt != null ? (
              <Form method="post" action={`/publishers/${user.id}/mark-as-returned`}>
                <Button type="submit" size="icon" title={m.publishers_view_mark_as_returned_title()}>
                  <RotateCcw className="size-4" />
                </Button>
              </Form>
            ) : user.isPublisher ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary" size="icon" title={m.publishers_edit_deactivate_title()}>
                    <UserMinus className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{m.publishers_view_mark_as_left_dialog_title()}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {m.publishers_view_mark_as_left_dialog_description()}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                    <Form method="post" action={`/publishers/${user.id}/mark-as-left`}>
                      <AlertDialogAction type="submit">
                        {m.publishers_view_mark_as_left_confirm()}
                      </AlertDialogAction>
                    </Form>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" title={m.publishers_edit_activate_title()}>
                    <UserCheck className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{m.publishers_view_make_publisher_dialog_title()}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {m.publishers_view_make_publisher_dialog_description()}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                    <Form method="post" action={`/publishers/${user.id}/make-publisher`}>
                      <AlertDialogAction type="submit">
                        {m.publishers_view_make_publisher_confirm()}
                      </AlertDialogAction>
                    </Form>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        }
      />

      <Form method="post" className="flex flex-col gap-6" onChange={markDirty}>
        <PublisherPersonalInformationForm user={user} onGenderChange={setGender} />
        <PublisherNominationForm user={user} gender={gender} />
        <PublisherFieldServiceForm user={user} groups={groups} hideAuxiliaryPioneer={hideAuxiliaryPioneer} />

        <SubmitButton size="lg" className="self-start">
          {m.publishers_edit_submit()}
        </SubmitButton>
      </Form>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const submission = parseWithZod(await request.formData(), { schema: updatePublisherSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const {
    firstname,
    lastname,
    email,
    gender,
    birthDate,
    baptismDate,
    isHelder,
    isServant,
    isAnointed,
    group,
    type,
    phone,
    address,
  } = submission.value
  const previousPage = request.headers.get('referer')

  return withScopeFromContext(context, async db => {
    const user = await updateMember(
      db,
      requireParamId(params.publisherId, '/publishers'),
      currentUser.congregationId,
      currentUser.id,
      {
        firstname,
        lastname,
        gender,
        baptismDate: baptismDate || null,
        birthDate: birthDate || null,
        isHelder,
        isServant,
        isAnointed,
        groupId: group ?? null,
        email: email && email.length > 0 ? email : null,
        type,
        address,
        phone,
      },
    )
    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.publishers_edit_success({ name: user.firstname ?? '' }))
    return redirect(previousPage ?? `/publishers/${user.id}`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
