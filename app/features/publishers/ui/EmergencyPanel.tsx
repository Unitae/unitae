import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { SidePanel } from '@unitae/ui'
import { Plus, Trash2 } from 'lucide-react'
import { type ReactNode, type Ref, useEffect } from 'react'
import { useFetcher } from 'react-router'

import { updateEmergencyInfoSchema } from '~/features/publishers/schemas/emergency-info.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { Skeleton } from '~/shared/ui/skeleton'
import { Switch } from '~/shared/ui/switch'

import { EmergencyFacts, type EmergencyInfo } from './EmergencyFacts'

const FORM_ID = 'emergency-form'

type LoadResult = ({ ok: true; name: string; canManage: boolean } & EmergencyInfo) | { ok: false; reason: string }

interface EmergencyPanelProps {
  publisherId: number
  /** Docked beside the page from 1280 px; a sheet over it below. */
  docked: boolean
  /** The button that opened it: focus goes back there on close. */
  trigger: HTMLElement | null
  formRef?: Ref<HTMLFormElement>
  /** × and Escape: the host asks first while the docked form holds changes. */
  onRequestClose: () => void
  /** Closes without asking: « Annuler » or a save. */
  onClose: () => void
}

/**
 * One person's emergency information, beside the page or over it: loaded from its route and saved back to it. The
 * publisher record and the group page's siren open the same panel; the route decides who reads and who changes it.
 */
export function EmergencyPanel({
  publisherId,
  docked,
  trigger,
  formRef,
  onRequestClose,
  onClose,
}: EmergencyPanelProps) {
  const loader = useFetcher<LoadResult>()
  const saver = useFetcher()
  useCloseOnSave(saver, onClose)

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    loader.load(`/publishers/${publisherId}/emergency-info`)
  }, [publisherId])

  const info = loader.data?.ok ? loader.data : null
  const failed = loader.data != null && !loader.data.ok
  const title = m.publishers_emergency_title()
  const description = info?.name ?? m.report_panel_loading_title()

  let body: ReactNode
  if (failed) body = <p className="text-muted-foreground text-sm">{m.publishers_emergency_unavailable()}</p>
  else if (info == null) body = <Skeleton className="h-40 w-full" />
  else if (info.canManage)
    body = <EmergencyForm publisherId={publisherId} info={info} fetcher={saver} formRef={formRef} />
  else body = <EmergencyFacts info={info} />

  const footer = info?.canManage && (
    <div className="flex w-full items-center justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onClose}>
        {m.common_cancel()}
      </Button>
      <Button type="submit" form={FORM_ID} disabled={saver.state !== 'idle'}>
        {m.common_save()}
      </Button>
    </div>
  )

  if (docked) {
    return (
      <SidePanel
        title={title}
        description={description}
        closeLabel={m.common_close()}
        onClose={onRequestClose}
        returnFocus={trigger}
        footer={footer || undefined}
      >
        {body}
      </SidePanel>
    )
  }
  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        {footer && <SheetFooter className="border-border border-t">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}

interface EmergencyFormProps {
  publisherId: number
  info: EmergencyInfo
  fetcher: ReturnType<typeof useFetcher>
  formRef?: Ref<HTMLFormElement>
}

/** The two checks as switches, then the contacts, each with its name, its tie to the person and its phone. */
function EmergencyForm({ publisherId, info, fetcher, formRef }: EmergencyFormProps) {
  const [form, fields] = useForm({
    id: FORM_ID,
    lastResult: (fetcher.data as { ok?: boolean } | undefined)?.ok ? undefined : (fetcher.data as never),
    defaultValue: {
      contacts: info.emergencyContacts.map(({ name, relationship, phone }) => ({ name, relationship, phone })),
    },
    onValidate: ({ formData }) => parseWithZod(formData, { schema: updateEmergencyInfoSchema }),
  })
  const contacts = fields.contacts.getFieldList()
  const formErrors = form.errors ?? []

  return (
    <fetcher.Form
      method="post"
      action={`/publishers/${publisherId}/emergency-info`}
      {...getFormProps(form)}
      ref={formRef}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col">
        <SwitchRow
          id="dpa"
          name={fields.dpaCardUpToDate.name}
          label={m.publishers_emergency_dpa_label()}
          checked={info.dpaCardUpToDate}
        />
        <SwitchRow
          id="backpack"
          name={fields.survivalBackpackReady.name}
          label={m.publishers_emergency_backpack_label()}
          checked={info.survivalBackpackReady}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{m.publishers_emergency_contacts_title()}</span>
        {contacts.map((contact, index) => {
          const field = contact.getFieldset()
          return (
            <div
              key={contact.key}
              className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-md border border-border p-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name.id}>{m.publishers_emergency_contact_name()}</Label>
                <Input {...getInputProps(field.name, { type: 'text' })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.relationship.id}>{m.publishers_emergency_contact_relationship_short()}</Label>
                <Input {...getInputProps(field.relationship, { type: 'text' })} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.publishers_emergency_contact_remove()}
                {...form.remove.getButtonProps({ name: fields.contacts.name, index })}
              >
                <Trash2 />
              </Button>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor={field.phone.id}>{m.publishers_emergency_contact_phone()}</Label>
                <Input {...getInputProps(field.phone, { type: 'tel' })} />
              </div>
              {(field.name.errors || field.phone.errors) && (
                <p className="col-span-full text-destructive text-xs">{m.publishers_emergency_contact_invalid()}</p>
              )}
            </div>
          )
        })}
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          {...form.insert.getButtonProps({ name: fields.contacts.name })}
        >
          <Plus />
          {m.publishers_emergency_contact_add()}
        </Button>
      </div>
      {formErrors.length > 0 && (
        <p role="alert" className="text-destructive text-sm">
          {formErrors.join(' ')}
        </p>
      )}
    </fetcher.Form>
  )
}

function SwitchRow({ id, name, label, checked }: { id: string; name: string; label: string; checked: boolean }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} name={name} defaultChecked={checked} />
    </div>
  )
}
