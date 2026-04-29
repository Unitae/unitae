import { parseWithZod } from '@conform-to/zod'
import { Archive, IdCard } from 'lucide-react'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { updatePublisherSchema } from '~/features/publishers/schemas/edit-publisher.schema'
import { updatePublisher } from '~/features/publishers/server/update-publisher.server'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
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
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const result = await db.user.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: {
          id: requireParamId(params.publisherId, '/publishers'),
          congregationId: currentUser.congregationId,
        },
      },
    })

    if (result == null) throw redirect('/publishers')

    const showAuxiliaryPioneer = await getBoolSetting(
      db,
      CongregationSettingKey.AuxiliaryPioneerProfileActivated,
      currentUser.congregationId,
    )
    const groups = await db.publisherGroup.findMany({ where: { congregationId: currentUser.congregationId } })
    const { email, password, ...user } = result
    return {
      user: {
        ...user,
        email: email.includes('@placeholder.unitae.app') ? undefined : email,
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
          user.isPublisher ? (
            <Form method="post" action={`/settings/users/${user.id}/unmake-publisher`}>
              <Button type="submit" variant="secondary" size="icon" title={m.publishers_edit_deactivate_title()}>
                <Archive className="size-4" />
              </Button>
            </Form>
          ) : (
            <Form method="post" action={`/settings/users/${user.id}/make-publisher`}>
              <Button type="submit" size="icon" title={m.publishers_edit_activate_title()}>
                <IdCard className="size-4" />
              </Button>
            </Form>
          )
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
  const currentUser = context.get(userContext)
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
    const user = await updatePublisher(
      db,
      requireParamId(params.publisherId, '/publishers'),
      currentUser.congregationId,
      {
        firstname,
        lastname,
        gender,
        baptismDate: baptismDate || null,
        birthDate: birthDate || null,
        isHelder,
        isServant,
        isAnointed,
        groupId: group ?? 0,
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
