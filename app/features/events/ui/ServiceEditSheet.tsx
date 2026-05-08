import { useEffect, useRef } from 'react'
import type { useFetcher } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { type RoleOption, RolePicker } from '~/shared/ui/RolePicker'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

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

const FORM_ID = 'service-edit-form'

export function ServiceEditSheet({ open, onOpenChange, service, mode, fetcher, roles }: ServiceEditSheetProps) {
  const isEditing = service != null
  const prevState = useRef(fetcher.state)

  useEffect(() => {
    if (
      prevState.current === 'submitting' &&
      fetcher.state === 'idle' &&
      (fetcher.data as { ok?: boolean } | undefined)?.ok
    ) {
      onOpenChange(false)
    }
    prevState.current = fetcher.state
  }, [fetcher.state, fetcher.data, onOpenChange])

  const intent = mode === 'template' ? 'upsert-service-role' : isEditing ? 'update-service' : 'add-service'
  const nameField = mode === 'template' ? 'roleName' : 'serviceName'
  const pickerKey = `${mode}-${service?.id ?? 'new'}`
  const defaultChipLabel = m.programs_edit_publisher_default_chip()

  const title =
    mode === 'template' ? m.programs_edit_service_section_template() : m.programs_edit_service_section_event()
  const scopeNote = mode === 'template' ? m.programs_edit_part_scope_template() : m.programs_edit_part_scope_event()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? title : m.programs_edit_service_sheet_title_new()}</SheetTitle>
          <SheetDescription>{scopeNote}</SheetDescription>
        </SheetHeader>

        <fetcher.Form id={FORM_ID} method="post" className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
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
              defaultLabel={defaultChipLabel}
            />
          </div>
        </fetcher.Form>

        <SheetFooter>
          <SubmitButton form={FORM_ID}>{m.common_save()}</SubmitButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
