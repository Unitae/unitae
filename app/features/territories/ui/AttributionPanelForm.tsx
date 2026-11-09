import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { SegmentedControl } from '@unitae/ui'
import { type Ref, useState } from 'react'
import type { FetcherWithComponents } from 'react-router'

import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { attributionPanelActionSchema } from '~/features/territories/schemas/attribution.schema'
import type {
  AssignPanelData,
  AttributablePerson,
  AttributionPanelData,
} from '~/features/territories/server/attribution-panel.queries'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { type PersonDescription, PersonDropdown } from '~/shared/ui/PersonDropdown'
import { Textarea } from '~/shared/ui/textarea'
import { addDays } from '~/shared/utils/calendar-day'
import { formatDay, shortDay } from '~/shared/utils/format-day'
import { formatPersonName } from '~/shared/utils/format-person-name'

import { PANEL_ROUTE } from './AttributionDialogs'
import { StandingBox } from './AttributionStanding'
import { loadFacts } from './attribution-labels'

type Method = TerritoryAttributionKind

const fieldClass = 'flex flex-col gap-1.5'

const helpClass = 'text-faint text-xs'

interface FormBase {
  fetcher: FetcherWithComponents<unknown>
  formId: string
  formRef?: Ref<HTMLFormElement>
  today: string
  /** Phone work is a method of attribution, not a kind of territory. */
  phoneMethod: boolean
}

function useAttributionForm(fetcher: FetcherWithComponents<unknown>, formId: string) {
  const result = fetcher.data as { status?: string } | undefined
  return useForm({
    id: formId,
    lastResult: result?.status != null ? (result as never) : undefined,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: attributionPanelActionSchema }),
  })
}

/** One attribution to change: where it stands, then who holds it, by which method, its days and its notes. */
export function AttributionEditForm({
  data,
  fetcher,
  formId,
  formRef,
  today,
  phoneMethod,
  onCancel,
  onResume,
}: FormBase & { data: AttributionPanelData; onCancel: () => void; onResume: () => void }) {
  const { attribution, publisher } = data
  const [form, fields] = useAttributionForm(fetcher, formId)
  const [method, setMethod] = useState<Method>(attribution.type)
  const campaign = attribution.campaign != null

  return (
    <fetcher.Form
      method="post"
      action={PANEL_ROUTE}
      {...getFormProps(form)}
      ref={formRef}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="id" value={attribution.id} />
      <input type="hidden" name="type" value={method} />
      <FormErrors errors={form.errors} />

      <StandingBox data={data} today={today} onResume={onResume} />

      <PublisherField
        id={`${formId}-publisher`}
        people={data.people}
        defaultValue={String(publisher.id)}
        errors={fields.publisher.errors}
      />
      {phoneMethod && !campaign && <MethodField value={method} onChange={setMethod} />}

      <div className="grid grid-cols-2 gap-2.5">
        <div className={fieldClass}>
          <Label htmlFor={`${formId}-start`}>{m.attributions_panel_start()}</Label>
          <Input
            id={`${formId}-start`}
            name="start-date"
            type="date"
            required
            max={today}
            defaultValue={attribution.startDay}
            className="tabular-nums"
          />
          <FieldErrors errors={fields['start-date'].errors} />
        </div>
        <div className={fieldClass}>
          <Label htmlFor={`${formId}-due`}>{m.attributions_panel_due()}</Label>
          <Input
            id={`${formId}-due`}
            name="late-date"
            type="date"
            required
            defaultValue={attribution.lateDay}
            className="tabular-nums"
          />
          <FieldErrors errors={fields['late-date'].errors} />
        </div>
      </div>

      <NotesField id={`${formId}-notes`} defaultValue={attribution.notes} />

      <button
        type="button"
        onClick={onCancel}
        className="-ml-1 self-start rounded-sm px-1 py-0.5 text-danger-text text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {m.attributions_panel_cancel_button()}
      </button>
    </fetcher.Form>
  )
}

/** A territory to attribute: its last attribution, then who takes it, by which method, from which day. */
export function AttributionAssignForm({
  data,
  fetcher,
  formId,
  formRef,
  today,
  phoneMethod,
}: FormBase & { data: AssignPanelData }) {
  const [form, fields] = useAttributionForm(fetcher, formId)
  const [method, setMethod] = useState<Method>(TerritoryAttributionKind.Default)
  const [start, setStart] = useState(today)
  const { campaign, last } = data
  const days = data.durationDays[method]

  return (
    <fetcher.Form
      method="post"
      action={PANEL_ROUTE}
      {...getFormProps(form)}
      ref={formRef}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="territory" value={data.territory.id} />
      <input type="hidden" name="type" value={campaign != null ? TerritoryAttributionKind.Default : method} />
      <FormErrors errors={form.errors} />

      <p className="rounded-md bg-subtle px-3 py-2.5 text-muted-foreground text-sm">
        {campaign != null
          ? campaign.closes
            ? m.attributions_panel_campaign_notice({
                name: campaign.name,
                date: formatDay(campaign.endDay, { weekday: 'short', day: 'numeric', month: 'short' }),
              })
            : m.attributions_panel_campaign_open_notice({ name: campaign.name })
          : last == null
            ? m.attributions_panel_never()
            : m.attributions_panel_last({
                name: formatPersonName(last, m.attributions_former_publisher()),
                start: shortDay(last.startDay, today),
                end: last.endDay != null ? shortDay(last.endDay, today) : '…',
              })}
      </p>

      <PublisherField id={`${formId}-publisher`} people={data.people} errors={fields.publisher.errors} />
      {phoneMethod && campaign == null && <MethodField value={method} onChange={setMethod} />}

      <div className={fieldClass}>
        <Label htmlFor={`${formId}-start`}>{m.attributions_panel_start()}</Label>
        <Input
          id={`${formId}-start`}
          name="start-date"
          type="date"
          required
          max={today}
          value={start}
          onChange={event => setStart(event.target.value)}
          className="w-44 tabular-nums"
        />
        <FieldErrors errors={fields['start-date'].errors} />
        {start !== '' && !(campaign?.closes ?? false) && (
          <p className={helpClass}>
            {m.attributions_panel_due_hint({
              date: formatDay(addDays(start, days), {
                weekday: 'short',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
              count: days,
            })}
          </p>
        )}
      </div>

      <NotesField id={`${formId}-notes`} defaultValue="" />
    </fetcher.Form>
  )
}

function PublisherField({
  id,
  people,
  defaultValue,
  errors,
}: {
  id: string
  people: AttributablePerson[]
  defaultValue?: string
  errors: string[] | undefined
}) {
  const byId = new Map(people.map(person => [person.id, person]))
  const describe = (personId: number): PersonDescription | undefined => {
    const person = byId.get(personId)
    if (person == null) return undefined
    return { facts: loadFacts(person), tone: person.late > 0 ? 'warning' : undefined }
  }
  return (
    <div className={fieldClass}>
      <Label htmlFor={id}>{m.attributions_panel_publisher()}</Label>
      <PersonDropdown
        id={id}
        name="publisher"
        people={people}
        defaultValue={defaultValue}
        allowNone={false}
        placeholder={m.attributions_panel_publisher_placeholder()}
        describePerson={describe}
        aria-invalid={errors?.length ? true : undefined}
      />
      <FieldErrors errors={errors} />
    </div>
  )
}

function MethodField({ value, onChange }: { value: Method; onChange: (value: Method) => void }) {
  return (
    <div className={fieldClass}>
      <span className="font-medium text-sm">{m.attributions_panel_mode()}</span>
      <SegmentedControl
        aria-label={m.attributions_panel_mode()}
        value={value}
        onValueChange={onChange}
        options={[
          { value: TerritoryAttributionKind.Default, label: m.attributions_panel_mode_default() },
          { value: TerritoryAttributionKind.Phone, label: m.attributions_panel_mode_phone() },
        ]}
      />
    </div>
  )
}

function NotesField({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <div className={fieldClass}>
      <Label htmlFor={id}>
        {m.attributions_panel_notes()}{' '}
        <span className="font-normal text-faint">· {m.attributions_panel_notes_hint()}</span>
      </Label>
      <Textarea id={id} name="notes" rows={3} defaultValue={defaultValue} />
    </div>
  )
}

function FieldErrors({ errors }: { errors: string[] | undefined }) {
  if (!errors?.length) return null
  return <p className="text-danger-text text-sm">{errors.join(' ')}</p>
}

function FormErrors({ errors }: { errors: string[] | undefined }) {
  if (!errors?.length) return null
  return (
    <p role="alert" className="text-danger-text text-sm">
      {errors.join(' ')}
    </p>
  )
}
