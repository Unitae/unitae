import { useId } from 'react'
import type { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import type { RoleOption } from '~/shared/types/role'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { RoleChips } from '~/shared/ui/RoleChips'
import { cn } from '~/shared/utils/utils'
import type { PartEditorMode } from './PartEditor'

export type ServiceData = {
  id?: number
  name: string
  allowedRoleIds: number[]
}

export interface ServiceEditorProps {
  service: ServiceData | null
  mode: PartEditorMode
  fetcher: ReturnType<typeof useFetcher>
  roles: RoleOption[]
  /** Receives the form element, e.g. to count its changes. */
  formRef?: (form: HTMLFormElement | null) => void
  className?: string
}

/** The id of the service form, for a submit button placed outside it. */
export const SERVICE_FORM_ID = 'service-edit-form'

/** The title and the scope line of the service editor, wherever it is shown. */
export function serviceEditorCopy(mode: PartEditorMode, isEditing: boolean) {
  const title = !isEditing
    ? m.programs_edit_service_sheet_title_new()
    : mode === 'template'
      ? m.programs_edit_service_section_template()
      : m.programs_edit_service_section_event()
  const description = mode === 'template' ? m.programs_edit_part_scope_template() : m.programs_edit_part_scope_event()
  return { title, description }
}

/** The fields of a service (sound, attendants…), for an event or a template. Remount it to start again. */
export function ServiceEditor({ service, mode, fetcher, roles, formRef, className }: ServiceEditorProps) {
  const rolesLabelId = useId()
  const intent = mode === 'template' ? 'upsert-service-role' : service != null ? 'update-service' : 'add-service'
  const nameField = mode === 'template' ? 'roleName' : 'serviceName'

  return (
    <fetcher.Form id={SERVICE_FORM_ID} ref={formRef} method="post" className={cn('flex flex-col gap-4', className)}>
      <input type="hidden" name="intent" value={intent} />
      {mode === 'template' && service?.id && <input type="hidden" name="roleId" value={service.id} />}
      {mode === 'event' && service?.id && <input type="hidden" name="serviceAssignmentId" value={service.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameField}>{m.programs_edit_part_name_label()}</Label>
        <Input id={nameField} name={nameField} defaultValue={service?.name ?? ''} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label id={rolesLabelId}>{m.programs_edit_service_allowed_roles_label()}</Label>
        <RoleChips
          roles={roles}
          selectedIds={service?.allowedRoleIds ?? []}
          name="allowedRoleIds"
          defaultLabel={m.programs_edit_publisher_default_chip()}
          labelledBy={rolesLabelId}
        />
      </div>
    </fetcher.Form>
  )
}
