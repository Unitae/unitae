import { parseWithZod } from '@conform-to/zod'
import { Calendar, Star, Users } from 'lucide-react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { type AvailableDynamicType, DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { createDynamicDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { createDynamicDocument } from '~/features/display-board/server/board-document.server'
import { listAvailableDynamicTypes } from '~/features/display-board/server/dynamic-documents.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new-dynamic'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_new_dynamic_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const available = await listAvailableDynamicTypes(db, congregationId)
    const sections = await db.boardSection.findMany({
      where: { congregationId },
      orderBy: { order: 'asc' },
    })
    return { available, hasSection: sections.length > 0 }
  })
}

function iconFor(type: string) {
  if (type === DynamicType.PublisherGroups) return <Users className="size-5" />
  if (type === DynamicType.Pioneers) return <Star className="size-5" />
  if (type === DynamicType.Programme) return <Calendar className="size-5" />
  return null
}

export default function NewDynamicDocumentPage({ loaderData }: Route.ComponentProps) {
  const { available, hasSection } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.board_new_dynamic_title()} subtitle={m.board_new_dynamic_subtitle()} />

      {!hasSection && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{m.board_new_dynamic_requires_section()}</p>
          </CardContent>
        </Card>
      )}

      {available.length === 0 ? (
        <EmptyState
          icon={Users}
          title={m.board_new_dynamic_empty_title()}
          description={m.board_new_dynamic_empty_description()}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map(item => (
            <AvailableCard key={`${item.dynamicType}|${item.dynamicRef ?? ''}`} item={item} disabled={!hasSection} />
          ))}
        </div>
      )}
    </div>
  )
}

function AvailableCard({ item, disabled }: { item: AvailableDynamicType; disabled: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div className="text-muted-foreground">{iconFor(item.dynamicType)}</div>
        <div className="flex-1">
          <p className="font-medium text-sm">{item.defaultTitle}</p>
          {item.alreadyAdded && <p className="text-muted-foreground text-xs">{m.board_new_dynamic_already_added()}</p>}
        </div>
        <Form method="post">
          <input type="hidden" name="dynamicType" value={item.dynamicType} />
          <input type="hidden" name="dynamicRef" value={item.dynamicRef ?? ''} />
          <input type="hidden" name="title" value={item.defaultTitle} />
          <Button type="submit" size="sm" disabled={item.alreadyAdded || disabled}>
            {m.board_new_dynamic_add_button()}
          </Button>
        </Form>
      </CardContent>
    </Card>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: createDynamicDocumentSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { dynamicType, title } = submission.value
  const dynamicRef = submission.value.dynamicRef === '' ? null : submission.value.dynamicRef

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const section = await db.boardSection.findFirst({
      where: { congregationId },
      orderBy: { order: 'asc' },
    })

    if (!section) {
      session.flash('error', m.board_new_dynamic_requires_section())
      return redirect('/board/documents/new-dynamic', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    const settings = await createDynamicDocument(db, {
      title,
      dynamicType,
      dynamicRef,
      sectionId: section.id,
      congregationId,
    })

    session.flash('success', m.board_new_dynamic_added({ name: title }))

    return redirect(`/board/dynamic/${settings.id}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
