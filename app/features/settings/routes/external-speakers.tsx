import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { data, Link, redirect } from 'react-router'
import { getOurSpeakerListPage } from '~/features/events/index.server'
import { externalSpeakerSettingsSchema, NO_ROLE } from '~/features/settings/schemas/external-speaker-settings.schema'
import {
  NOT_OFFERED_ROLE_KEYS,
  updateExternalSpeakerSettings,
} from '~/features/settings/server/external-speaker-settings.server'
import { SettingsField } from '~/features/settings/ui/SettingsField'
import { SettingsForm } from '~/features/settings/ui/SettingsForm'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { redirectWithToast } from './_toast.server'
import type { Route } from './+types/external-speakers'

// Réglages › Orateurs extérieurs: the organigram role whose members may go on the list we send, and the role the
// congregation created for its public talk coordinator. The coordinator comes from the service committee, as is.

export const meta: Route.MetaFunction = () => [{ title: m.settings_external_speakers_meta_title() }]

function requireConfigure(permissions: Set<Permission>) {
  if (!permissions.has(Permission.CanConfigureCongregation)) throw redirect('/settings')
}

export function loader({ context }: Route.LoaderArgs) {
  requireConfigure(context.get(permissionsContext))
  return withScopeFromContext(context, async (db, congregationId) => {
    const [roles, page] = await Promise.all([
      listDelegatableRoles(db, congregationId),
      getOurSpeakerListPage(db, congregationId),
    ])
    return {
      roles: roles
        .filter(role => !NOT_OFFERED_ROLE_KEYS.includes(role.key))
        .map(role => ({ key: role.key, name: getRoleDisplayName(role), memberCount: role.memberCount })),
      candidatesRoleKey: page.candidatesRole?.key ?? null,
      responsibleRoleKey: page.responsibleRole?.key ?? null,
      coordinator: page.header.coordinator?.name ?? null,
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  requireConfigure(context.get(permissionsContext))
  const { id: actorId } = context.get(currentAccountContext)
  const submission = parseWithZod(await request.formData(), { schema: externalSpeakerSettingsSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

  try {
    await withScopeFromContext(context, (db, congregationId) =>
      updateExternalSpeakerSettings(db, congregationId, actorId, submission.value),
    )
  } catch (error) {
    // A role deleted while the page was open.
    if (error instanceof NotFoundError) {
      return data(submission.reply({ formErrors: [m.settings_external_speakers_role_gone()] }), { status: 400 })
    }
    throw error
  }
  return redirectWithToast(request, '/settings/external-speakers', m.settings_saved())
}

function RoleSelect({
  id,
  name,
  value,
  roles,
}: {
  id: string
  name: string
  value: string | null
  roles: { key: string; name: string }[]
}) {
  return (
    <Select name={name} defaultValue={value ?? NO_ROLE}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ROLE}>{m.settings_external_speakers_none()}</SelectItem>
        {roles.map(role => (
          <SelectItem key={role.key} value={role.key}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function ExternalSpeakerSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { roles, candidatesRoleKey, responsibleRoleKey, coordinator } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: externalSpeakerSettingsSchema }),
  })

  return (
    <div className="flex max-w-4xl flex-col">
      <SettingsHeader title={m.settings_entry_external_speakers()} subtitle={m.settings_external_speakers_subtitle()} />

      <SettingsForm {...getFormProps(form)} savedKey={JSON.stringify(loaderData)} errors={form.errors}>
        <FormSection
          title={m.settings_external_speakers_section()}
          description={m.settings_external_speakers_section_hint()}
        >
          <SettingsField
            id={fields.candidatesRoleKey.id}
            label={m.settings_external_speakers_candidates()}
            hint={m.settings_external_speakers_candidates_hint()}
            error={fields.candidatesRoleKey.errors?.[0]}
            className="col-span-full"
          >
            <RoleSelect
              id={fields.candidatesRoleKey.id}
              name={fields.candidatesRoleKey.name}
              value={candidatesRoleKey}
              roles={roles}
            />
          </SettingsField>
          <SettingsField
            id={fields.responsibleRoleKey.id}
            label={m.settings_external_speakers_responsible()}
            hint={m.settings_external_speakers_responsible_hint()}
            error={fields.responsibleRoleKey.errors?.[0]}
            className="col-span-full"
          >
            <RoleSelect
              id={fields.responsibleRoleKey.id}
              name={fields.responsibleRoleKey.name}
              value={responsibleRoleKey}
              roles={roles}
            />
          </SettingsField>
          <div className="col-span-full flex flex-col gap-1">
            <p className="font-medium text-sm">{m.settings_external_speakers_coordinator()}</p>
            <p className="text-muted-foreground text-sm">
              {coordinator ? (
                m.settings_external_speakers_coordinator_from({ name: coordinator })
              ) : (
                <>
                  {m.settings_external_speakers_coordinator_missing()}{' '}
                  <Link to="/congregation/roles/organigram" className="underline underline-offset-2">
                    {m.settings_external_speakers_open_organigram()}
                  </Link>
                </>
              )}
            </p>
          </div>
        </FormSection>
      </SettingsForm>
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
