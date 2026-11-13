import { Plus } from 'lucide-react'
import { type Ref, useEffect, useState } from 'react'
import { type FetcherWithComponents, Link, useFetcher } from 'react-router'
import type { ContactMode, OurBrother } from '~/features/events/model/our-speaker.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Switch } from '~/shared/ui/switch'
import { DirectoryPanelFrame } from './DirectoryPanelFrame'
import { TalkNumbersInput } from './TalkNumbersInput'

// One brother of « Notre liste » beside the list: whether he goes out, the talks he prepares, what of his contact the
// other congregations read, and a note for them. Saved by the panel's footer; a reader sees it all, without controls.

const FORM_ID = 'our-brother-form'

interface Refusal {
  ok: false
  error: string
  field?: string
}

const refusalOf = (data: unknown): Refusal | null =>
  (data as { ok?: boolean } | undefined)?.ok === false ? (data as Refusal) : null

/** The first phone or e-mail: from his record, another one, or none. */
function FirstContact({
  kind,
  mode: initialMode,
  record,
  custom,
  error,
}: {
  kind: 'phone' | 'email'
  mode: ContactMode
  record: string
  custom: string
  error?: string
}) {
  const [mode, setMode] = useState<ContactMode>(initialMode)
  const id = `our-brother-${kind}`
  const label = kind === 'phone' ? m.external_speakers_ours_phone() : m.external_speakers_ours_email()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground font-normal">
        {label}
      </Label>
      <Select name={`${kind}Mode`} value={mode} onValueChange={value => setMode(value as ContactMode)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="record">
            {m.external_speakers_ours_record_value({ value: record || m.external_speakers_ours_record_empty() })}
          </SelectItem>
          <SelectItem value="custom">
            {kind === 'phone'
              ? m.external_speakers_ours_mode_custom_phone()
              : m.external_speakers_ours_mode_custom_email()}
          </SelectItem>
          <SelectItem value="hidden">{m.external_speakers_ours_mode_hidden()}</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'custom' ? (
        <Input
          name={`${kind}Custom`}
          type={kind === 'phone' ? 'tel' : 'email'}
          defaultValue={custom}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          autoFocus={initialMode !== 'custom'}
        />
      ) : (
        // Kept while another choice is shown, so coming back to « Un autre … » finds it again.
        <input type="hidden" name={`${kind}Custom`} value={custom} />
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}

/** The second phone or e-mail, typed: behind a button until there is one. */
function SecondContact({ kind, value }: { kind: 'phone' | 'email'; value: string }) {
  const [shown, setShown] = useState(value !== '')
  const label = kind === 'phone' ? m.external_speakers_ours_phone2() : m.external_speakers_ours_email2()
  if (!shown) {
    return (
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setShown(true)}>
        <Plus aria-hidden="true" />
        {label}
      </Button>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`our-brother-${kind}2`} className="text-muted-foreground font-normal">
        {label}
      </Label>
      <Input
        id={`our-brother-${kind}2`}
        name={`${kind}2`}
        type={kind === 'phone' ? 'tel' : 'email'}
        defaultValue={value}
        autoFocus={value === ''}
      />
    </div>
  )
}

function BrotherForm({
  brother,
  canManage,
  fetcher,
  formRef,
}: {
  brother: OurBrother
  canManage: boolean
  fetcher: FetcherWithComponents<unknown>
  formRef: Ref<HTMLFormElement>
}) {
  // A refusal answers the form that was sent: once « Annuler » starts it again, it no longer applies.
  const [sent, setSent] = useState(false)
  const refusal = sent ? refusalOf(fetcher.data) : null
  const fieldError = (name: string) => (refusal?.field === name ? refusal.error : undefined)
  return (
    <fetcher.Form id={FORM_ID} method="post" ref={formRef} noValidate onSubmit={() => setSent(true)}>
      <input type="hidden" name="intent" value="brother-update" />
      <input type="hidden" name="memberId" value={brother.memberId} />
      {/* A reader sees the same fields, none of them editable. */}
      <fieldset disabled={!canManage} className="flex flex-col gap-5">
        {refusal && refusal.field == null && (
          <p role="alert" className="bg-danger-soft text-danger-text rounded-md px-3 py-2.5 text-sm">
            {refusal.error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <span className="flex flex-1 flex-col gap-0.5">
            <Label htmlFor="our-brother-on-list">{m.external_speakers_ours_on_list()}</Label>
            <span className="text-faint text-xs">{m.external_speakers_ours_on_list_hint()}</span>
          </span>
          <Switch id="our-brother-on-list" name="onList" defaultChecked={brother.onList} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="our-brother-talks">{m.external_speakers_col_talks()}</Label>
          <TalkNumbersInput
            id="our-brother-talks"
            name="talks"
            defaultValue={brother.talks}
            placeholder={m.external_speakers_field_talks_placeholder()}
          />
          <span className="text-faint text-xs">{m.external_speakers_ours_talks_hint()}</span>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">{m.external_speakers_ours_contact()}</legend>
          <FirstContact
            kind="phone"
            mode={brother.phoneMode}
            record={brother.record.phone}
            custom={brother.phoneCustom}
            error={fieldError('phoneCustom')}
          />
          <SecondContact kind="phone" value={brother.phone2} />
          <FirstContact
            kind="email"
            mode={brother.emailMode}
            record={brother.record.email}
            custom={brother.emailCustom}
            error={fieldError('emailCustom')}
          />
          <SecondContact kind="email" value={brother.email2} />
          <span className="text-faint text-xs">{m.external_speakers_ours_contact_hint()}</span>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="our-brother-note">{m.external_speakers_ours_note()}</Label>
          <Input
            id="our-brother-note"
            name="note"
            defaultValue={brother.note}
            placeholder={m.external_speakers_ours_note_placeholder()}
            maxLength={300}
          />
        </div>
      </fieldset>
    </fetcher.Form>
  )
}

export function OurBrotherPanel({
  brother,
  canManage,
  canViewPublishers,
  docked,
  returnFocus,
  onClose,
  onDirtyChange,
}: {
  brother: OurBrother
  canManage: boolean
  canViewPublishers: boolean
  docked: boolean
  returnFocus: HTMLElement | null
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const fetcher = useFetcher()
  const form = useFormChanges()
  // « Annuler » and each save start the form again from what is saved.
  const [version, setVersion] = useState(0)
  const saved = JSON.stringify(brother)
  const dirty = canManage && form.changes > 0
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  const appointment =
    brother.appointment === 'elder'
      ? m.external_speakers_ours_elder()
      : brother.appointment === 'servant'
        ? m.external_speakers_ours_servant()
        : null
  const description = (
    <span className="flex flex-wrap items-center gap-x-1.5">
      {appointment && <span>{appointment}</span>}
      {appointment && canViewPublishers && <span aria-hidden="true">·</span>}
      {canViewPublishers && (
        <Link to={`/publishers/${brother.memberId}/view`} className="text-primary hover:underline">
          {m.external_speakers_ours_see_record()}
        </Link>
      )}
    </span>
  )
  const footer = canManage ? (
    <div className="flex w-full items-center gap-2">
      <span className="text-muted-foreground flex-1 text-sm" aria-live="polite">
        {form.changes === 0 ? null : m.form_changes({ count: form.changes })}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => (form.changes > 0 ? setVersion(value => value + 1) : onClose())}
      >
        {m.common_cancel()}
      </Button>
      <Button type="submit" size="sm" form={FORM_ID} disabled={fetcher.state !== 'idle' || form.changes === 0}>
        {m.common_save()}
      </Button>
    </div>
  ) : undefined

  return (
    <DirectoryPanelFrame
      docked={docked}
      title={brother.name}
      description={description}
      footer={footer}
      returnFocus={returnFocus}
      onClose={onClose}
    >
      <BrotherForm
        key={`${saved}:${version}`}
        brother={brother}
        canManage={canManage}
        fetcher={fetcher}
        formRef={form.ref}
      />
    </DirectoryPanelFrame>
  )
}
