import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createPublisherSchema } from '~/features/publishers/schemas/publisher.schema'
import { createPublisher } from '~/features/publishers/server/create-publisher.server'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Role } from '~/shared/types/role'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { handleAppError } from '~/shared/utils/handle-app-error.server'

import type { Route } from './+types/new-publisher'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_new_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const groups = await db.publisherGroup.findMany({ where: { congregationId: currentUser.congregationId } })
    const showAuxiliaryPioneer = await getBoolSetting(
      db,
      CongregationSettingKey.AuxiliaryPioneerProfileActivated,
      currentUser.congregationId,
    )

    return { groups, hideAuxiliaryPioneer: !showAuxiliaryPioneer }
  })
}

export default function NewPublisher({ loaderData }: Route.ComponentProps) {
  const { groups, hideAuxiliaryPioneer } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  const [gender, setGender] = useState<'male' | 'female' | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.publishers_new_title()}
        subtitle={m.publishers_new_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publishers(), to: '/publishers' }, { label: m.publishers_new_title() }]}
        backTo="/publishers"
      />

      <Form method="post" className="flex flex-col gap-6" onChange={markDirty}>
        <PublisherPersonalInformationForm onGenderChange={setGender} />
        <PublisherNominationForm gender={gender} />
        <PublisherFieldServiceForm groups={groups} hideAuxiliaryPioneer={hideAuxiliaryPioneer} />

        <SubmitButton size="lg" className="self-start">
          {m.publishers_new_submit()}
        </SubmitButton>
      </Form>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const congregation = context.get(congregationContext)
  const currentUser = context.get(userContext)
  const submission = parseWithZod(await request.formData(), { schema: createPublisherSchema })

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

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      const user = await createPublisher(db, congregation, {
        firstname,
        lastname,
        email: email && email.length > 0 ? email : null,
        gender,
        birthDate: birthDate || null,
        baptismDate: baptismDate || null,
        isHelder,
        isServant,
        isAnointed,
        groupId: group ?? null,
        type,
        congregationId: currentUser.congregationId,
        phone: phone ?? '',
        address: address ?? '',
        actorId: currentUser.id,
      })

      session.flash('success', m.publishers_new_success({ name: user.firstname ?? '' }))
      return redirect(`/publishers/${user.id}/edit`, {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    } catch (error) {
      await handleAppError(error, session, '/publishers/new')
    }
  })
}
