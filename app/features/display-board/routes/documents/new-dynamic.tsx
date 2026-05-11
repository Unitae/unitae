import { parseWithZod } from '@conform-to/zod'
import { Calendar, Info, Star, Users } from 'lucide-react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import type { ProgrammeDynamicConfig } from '~/features/display-board/model/dynamic-document.type'
import { type AvailableDynamicType, DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { createDynamicDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { createDynamicDocument } from '~/features/display-board/server/board-document.server'
import { listAvailableDynamicTypes } from '~/features/display-board/server/dynamic-documents.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'

import type { Route } from './+types/new-dynamic'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_new_dynamic_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
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
      <PageHeader
        title={m.board_new_dynamic_title()}
        subtitle={m.board_new_dynamic_subtitle()}
        breadcrumbs={[{ label: m.sidebar_documents(), to: '/board/documents' }, { label: m.board_new_dynamic_title() }]}
        backTo="/board/documents"
      />

      {!hasSection && (
        <Alert>
          <Info />
          <AlertDescription>{m.board_new_dynamic_requires_section()}</AlertDescription>
        </Alert>
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
          <SubmitButton size="sm" disabled={item.alreadyAdded || disabled}>
            {m.board_new_dynamic_add_button()}
          </SubmitButton>
        </Form>
      </CardContent>
    </Card>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: createDynamicDocumentSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { dynamicType, title } = submission.value
  const dynamicRef = submission.value.dynamicRef === '' ? null : submission.value.dynamicRef

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
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

    // For programme documents, build default config with all templates selected
    let dynamicConfig: ProgrammeDynamicConfig | undefined
    if (dynamicType === DynamicType.Programme) {
      const templates = await db.programmeTemplate.findMany({
        where: { congregationId },
        select: { id: true },
      })
      dynamicConfig = {
        templates: templates.map(t => ({ templateId: t.id, parts: true, services: true })),
        groupBy: 'date',
      }
    }

    const settings = await createDynamicDocument(db, {
      title,
      dynamicType,
      dynamicRef,
      dynamicConfig,
      sectionId: section.id,
      congregationId,
    })

    session.flash('success', m.board_new_dynamic_added({ name: title }))

    return redirect(`/board/dynamic/${settings.id}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
