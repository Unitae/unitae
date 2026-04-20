import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createPublisherSchema } from '~/features/publishers/schemas/publisher.schema'
import { createPublisher } from '~/features/publishers/server/create-publisher.server'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import * as m from '~/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'

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

    return { groups, hideAuxiliaryPioneer: false }
  })
}

export default function NewPublisher({ loaderData }: Route.ComponentProps) {
  const { groups, hideAuxiliaryPioneer } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.publishers_new_title()} subtitle={m.publishers_new_subtitle()} />

      <Form method="post" className="flex flex-col gap-6">
        <PublisherPersonalInformationForm />
        <PublisherNominationForm />
        <PublisherFieldServiceForm groups={groups} hideAuxiliaryPioneer={hideAuxiliaryPioneer} />

        <Button type="submit" size="lg" className="self-start">
          {m.publishers_new_submit()}
        </Button>
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

  const { firstname, lastname, email, gender, birthDate, baptismDate, isHelder, isServant, isAnointed, group, type } =
    submission.value

  return withScopeFromContext(context, async db => {
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
      groupId: group ?? 0,
      type,
      congregationId: currentUser.congregationId,
    })

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.publishers_new_success({ name: user.firstname ?? '' }))
    return redirect(`/congregation/publishers/${user.id}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
