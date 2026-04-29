import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { data, Form, redirect, useFetcher } from 'react-router'
import { z } from 'zod'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'

import type { Route } from './+types/event-kinds'

const createKindSchema = z.object({
  intent: z.literal('create'),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

const deleteKindSchema = z.object({
  intent: z.literal('delete'),
  id: z.coerce.number(),
})

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_event_kinds_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.Admin)) throw redirect('/settings/congregation')

  const { congregationId } = context.get(userContext)
  return withScopeFromContext(context, async db => {
    const kinds = await db.eventKind.findMany({
      // biome-ignore lint/style/useNamingConvention: prisma filter key
      where: { congregationId, NOT: { key: 'off' } },
      orderBy: { name: 'asc' },
    })
    return { kinds }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.Admin)) throw redirect('/settings/congregation')

  const { congregationId } = context.get(userContext)
  const formData = await request.formData()
  const intent = formData.get('intent')

  return withScopeFromContext(context, async db => {
    if (intent === 'create') {
      const submission = parseWithZod(formData, { schema: createKindSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      const key = submission.value.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      await db.eventKind.create({
        data: { name: submission.value.name, color: submission.value.color, key, congregationId },
      })
    }

    if (intent === 'delete') {
      const submission = parseWithZod(formData, { schema: deleteKindSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      await db.eventKind.delete({
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma compound key
          id_congregationId: { id: submission.value.id, congregationId },
        },
      })
    }

    return redirect('/settings/congregation/event-kinds')
  })
}

export default function EventKindsPage({ loaderData }: Route.ComponentProps) {
  const { kinds } = loaderData
  const deleteFetcher = useFetcher()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_event_kinds_title()}
        subtitle={m.settings_event_kinds_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings_assembly(), to: '/settings/congregation' },
          { label: m.settings_event_kinds_title() },
        ]}
        backTo="/settings/congregation"
      />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{m.settings_event_kinds_create_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="create" />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{m.common_name()}</Label>
              <Input id="name" name="name" placeholder={m.settings_event_kinds_name_placeholder()} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="color">{m.settings_event_kinds_color_label()}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="color"
                  name="color"
                  type="color"
                  defaultValue="#6366f1"
                  className="h-9 w-16 cursor-pointer p-1"
                />
                <span className="text-muted-foreground text-xs">{m.settings_event_kinds_color_hint()}</span>
              </div>
            </div>
            <SubmitButton className="w-fit">{m.settings_event_kinds_create_button()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>

      {kinds.length > 0 && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">{m.settings_event_kinds_list_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {kinds.map(kind => (
              <div key={kind.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <span
                  className="size-4 shrink-0 rounded-full border"
                  style={{ backgroundColor: kind.color, borderColor: `${kind.color}80` }}
                />
                <span className="flex-1 text-sm font-medium">{kind.name}</span>
                <deleteFetcher.Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={kind.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    disabled={deleteFetcher.state !== 'idle'}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </deleteFetcher.Form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
