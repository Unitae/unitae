import { useEffect, useRef } from 'react'
import type { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { type RoleOption, RolePicker } from '~/shared/ui/RolePicker'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

type ServiceData = {
  id?: number
  name: string
  allowedRoleIds: number[]
}

type ServiceEditSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: ServiceData | null
  mode: 'event' | 'template'
  fetcher: ReturnType<typeof useFetcher>
  roles: RoleOption[]
}

export function ServiceEditSheet({ open, onOpenChange, service, mode, fetcher, roles }: ServiceEditSheetProps) {
  const isEditing = service != null
  const prevState = useRef(fetcher.state)

  useEffect(() => {
    if (prevState.current === 'submitting' && fetcher.state === 'idle') {
      onOpenChange(false)
    }
    prevState.current = fetcher.state
  }, [fetcher.state, onOpenChange])

  const intent = mode === 'template' ? 'upsert-service-role' : isEditing ? 'update-service' : 'add-service'
  const nameField = mode === 'template' ? 'roleName' : 'serviceName'
  const pickerKey = `${mode}-${service?.id ?? 'new'}`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {isEditing ? m.programs_edit_service_sheet_title_edit() : m.programs_edit_service_sheet_title_new()}
          </SheetTitle>
        </SheetHeader>
        <fetcher.Form method="post" className="flex flex-col gap-4 px-4">
          <input type="hidden" name="intent" value={intent} />
          {mode === 'template' && service?.id && <input type="hidden" name="roleId" value={service.id} />}
          {mode === 'event' && service?.id && <input type="hidden" name="serviceAssignmentId" value={service.id} />}

          <div className="flex flex-col gap-2">
            <Label htmlFor={nameField}>{m.programs_edit_part_name_label()}</Label>
            <Input id={nameField} name={nameField} defaultValue={service?.name ?? ''} required />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{m.programs_edit_service_allowed_roles_label()}</Label>
            <RolePicker
              key={pickerKey}
              roles={roles}
              selectedIds={service?.allowedRoleIds ?? []}
              name="allowedRoleIds"
              idPrefix={`service-allowed-${pickerKey}`}
              helpText={m.programs_edit_allowed_roles_help()}
            />
          </div>

          <SheetFooter>
            <SubmitButton>{m.common_save()}</SubmitButton>
          </SheetFooter>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  )
}
