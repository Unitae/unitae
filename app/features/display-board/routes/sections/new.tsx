import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createSectionSchema } from '~/features/display-board/schemas/board-section.schema'
import { createBoardSection } from '~/features/display-board/server/board-section.server'
import { setSectionVisibilityRoles } from '~/features/display-board/server/section-visibility.server'
import * as m from '~/i18n/paraglide/messages'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Card, CardContent } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { type RoleOption, RolePicker } from '~/shared/ui/RolePicker'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Création de section sur Tableau d'affichage - Unitae` }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  return withScopeFromContext(context, async db => {
    const { congregationId, id: userId } = context.get(currentAccountContext)
    const [roles, viewerRoleIds] = await Promise.all([
      db.role.findMany({
        where: { congregationId },
        select: { id: true, key: true, name: true, isBuiltIn: true },
        orderBy: [{ isBuiltIn: 'desc' }, { key: 'asc' }],
      }),
      resolveEffectiveRoleIds(db, userId, congregationId),
    ])
    return { roles, viewerRoleIds }
  })
}

export default function NewSectionPage({ loaderData, actionData }: Route.ComponentProps) {
  const { roles, viewerRoleIds } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createSectionSchema })
    },
  })
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([])
  const showLockoutWarning = selectedRoleIds.length > 0 && selectedRoleIds.every(id => !viewerRoleIds.includes(id))

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.board_sections_new_title()}
        subtitle={m.board_sections_new_subtitle()}
        breadcrumbs={[{ label: m.sidebar_sections(), to: '/board/sections' }, { label: m.board_sections_new_title() }]}
        backTo="/board/sections"
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.name.id}>{m.board_sections_new_name_label()}</Label>
              <Input
                {...getInputProps(fields.name, { type: 'text' })}
                placeholder={m.board_sections_new_name_placeholder()}
              />
              {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors}</p>}
            </div>

            <VisibilityField
              roles={roles}
              selectedIds={selectedRoleIds}
              onChange={setSelectedRoleIds}
              showLockoutWarning={showLockoutWarning}
            />

            <SubmitButton className="w-fit">{m.board_sections_new_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

interface VisibilityFieldProps {
  roles: RoleOption[]
  selectedIds: number[]
  onChange: (next: number[]) => void
  showLockoutWarning: boolean
}

export function VisibilityField({ roles, selectedIds, onChange, showLockoutWarning }: VisibilityFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label id="visibility-label">{m.board_sections_visibility_label()}</Label>
      <RolePicker
        roles={roles}
        selectedIds={selectedIds}
        name="visibilityRoleIds"
        idPrefix="visibility"
        defaultLabel={m.board_sections_visibility_default()}
        onChange={onChange}
        labelledBy="visibility-label"
      />
      <p className="text-muted-foreground text-xs">{m.board_sections_visibility_hint()}</p>
      {showLockoutWarning && (
        <Alert>
          <AlertDescription>{m.board_sections_visibility_self_lockout_warning()}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: createSectionSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, visibilityRoleIds } = submission.value

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    const section = await createBoardSection(db, { name, congregationId, actorId })

    if (section == null) {
      session.flash('error', m.common_generic_error())

      return redirect('/board', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    if (visibilityRoleIds.length > 0) {
      await setSectionVisibilityRoles(db, section.id, visibilityRoleIds, congregationId, actorId)
    }

    session.flash('success', m.board_sections_new_success({ name: section.name }))

    return redirect(`/board/sections/${section.id}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
