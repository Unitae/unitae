import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { SegmentedControl, Tag } from '@unitae/ui'
import { type Ref, useState } from 'react'
import type { FetcherWithComponents } from 'react-router'

import { reportTypeForMonth } from '~/features/publishers/model/activity-report-type'
import type { ReportPanelData } from '~/features/publishers/model/report-panel.type'
import { reportActionSchema } from '~/features/publishers/schemas/activity.schema'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { PublisherType, publisherTypeReportsHours } from '~/shared/types/publisher-type'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Switch } from '~/shared/ui/switch'
import { Textarea } from '~/shared/ui/textarea'
import { cn } from '~/shared/utils/utils'

import { serviceLabel } from './publisher-type-labels'
import { ReportGoal } from './ReportGoal'
import { formatMonth } from './report-month-format'

/** Without an enrolment, a month is a publisher's or an auxiliary pioneer's; a report filed otherwise keeps its type. */
function serviceOptions(recorded: PublisherType | undefined) {
  const types: PublisherType[] = [PublisherType.Normal, PublisherType.PionnierAuxiliaires]
  if (recorded != null && !types.includes(recorded)) types.push(recorded)
  return types.map(type => ({
    value: type,
    label: type === PublisherType.Normal ? m.report_panel_service_none() : serviceLabel(type),
  }))
}

const fieldClass = 'flex flex-col gap-1.5'

/** A stored number as a field's text: empty for none, so the placeholder shows. */
const asField = (value: number | null | undefined) => (value ? String(value) : '')
const helpClass = 'text-faint text-xs'

interface ReportFormProps {
  data: ReportPanelData
  fetcher: FetcherWithComponents<unknown>
  formId: string
  formRef?: Ref<HTMLFormElement>
  className?: string
}

/** The fields of one month's report. The panel or sheet around it holds the title and the buttons. */
export function ReportForm({ data, fetcher, formId, formRef, className }: ReportFormProps) {
  const { report, enrolment } = data
  const [chosen, setChosen] = useState<PublisherType>(report?.type ?? PublisherType.Normal)
  const [hours, setHours] = useState(asField(report?.hours))
  const [credit, setCredit] = useState(asField(report?.creditHours))

  const type = reportTypeForMonth(enrolment, chosen)
  const countsHours = publisherTypeReportsHours(type)
  const goal = enrolment?.goal ?? data.rates[type] ?? 0
  const monthName = formatMonth(data.month, data.year)
  // Group overseers never see the credit, so their count is the hours alone.
  const countedCredit = data.canGrantCredit ? Number(credit) || 0 : 0
  const result = fetcher.data as { status?: string } | undefined

  const [form] = useForm({
    id: formId,
    lastResult: result?.status != null ? (result as never) : undefined,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: reportActionSchema }),
  })

  return (
    <fetcher.Form
      method="post"
      action="/publishers/activity/report"
      {...getFormProps(form)}
      ref={formRef}
      className={cn('flex flex-col gap-4', className)}
    >
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="publisherId" value={data.publisher.id} />
      <input type="hidden" name="month" value={data.month} />
      <input type="hidden" name="year" value={data.year} />
      {enrolment == null && <input type="hidden" name="type" value={chosen} />}

      <FormErrors errors={form.errors} />

      <ServiceField
        enrolment={enrolment}
        recorded={report?.type}
        chosen={chosen}
        onChoose={setChosen}
        monthName={monthName}
      />

      {countsHours && (
        <ReportGoal
          monthName={monthName}
          goal={goal}
          hours={Number(hours) || 0}
          credit={countedCredit}
          source={enrolment != null ? 'enrolment' : 'rate'}
          serviceName={serviceLabel(type).toLocaleLowerCase(getLocale())}
        />
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {countsHours && (
          <div className={fieldClass}>
            <Label htmlFor={`${formId}-hours`}>{m.activity_new_hours_label()}</Label>
            <Input
              id={`${formId}-hours`}
              name="hours"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={hours}
              onChange={event => setHours(event.target.value)}
              className="tabular-nums"
            />
          </div>
        )}
        <div className={fieldClass}>
          <Label htmlFor={`${formId}-studies`}>{m.report_panel_studies_label()}</Label>
          <Input
            id={`${formId}-studies`}
            name="studies"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="0"
            defaultValue={asField(report?.studies)}
            className="tabular-nums"
          />
        </div>
      </div>

      {!countsHours && <PreachedField id={`${formId}-preached`} preached={report?.isPublisher ?? true} />}

      {countsHours && data.canGrantCredit && (
        <CreditField id={`${formId}-credit`} value={credit} onChange={setCredit} />
      )}

      <div className={fieldClass}>
        <Label htmlFor={`${formId}-observations`}>{m.activity_new_observations_label()}</Label>
        <Textarea id={`${formId}-observations`} name="observations" rows={3} defaultValue={report?.notes ?? ''} />
        {countsHours && !data.canGrantCredit && <span className={helpClass}>{m.report_panel_observations_help()}</span>}
      </div>
    </fetcher.Form>
  )
}

interface ServiceFieldProps {
  enrolment: ReportPanelData['enrolment']
  /** The type the report was filed with, when it was. */
  recorded: PublisherType | undefined
  chosen: PublisherType
  onChoose: (type: PublisherType) => void
  monthName: string
}

/** The month's service: stated when an enrolment covers it, asked otherwise. */
function ServiceField({ enrolment, recorded, chosen, onChoose, monthName }: ServiceFieldProps) {
  if (enrolment != null) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-faint text-sm">
          <Tag>{serviceLabel(enrolment.type)}</Tag>
          <span>{m.report_panel_enrolment_covers({ month: monthName })}</span>
        </div>
        {recorded != null && recorded !== enrolment.type && (
          <p className={helpClass}>{m.activity_edit_type_follows_enrolment()}</p>
        )}
      </div>
    )
  }

  const label = m.report_panel_service_label({ month: monthName })
  return (
    <div className={fieldClass}>
      <span className="font-medium text-sm">{label}</span>
      <SegmentedControl
        aria-label={label}
        value={chosen}
        onValueChange={onChoose}
        options={serviceOptions(recorded)}
        className="w-full"
      />
      <span className={helpClass}>{m.report_panel_service_help({ month: monthName })}</span>
    </div>
  )
}

function PreachedField({ id, preached }: { id: string; preached: boolean }) {
  return (
    <label htmlFor={id} className="flex min-h-9 items-center justify-between gap-3 text-sm">
      <span>{m.report_panel_preached_label()}</span>
      <Switch id={id} name="preached" defaultChecked={preached} />
    </label>
  )
}

/** The secretary's hour credit: counted toward the goal, never exported. */
function CreditField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className={fieldClass}>
      <Label htmlFor={id}>
        {m.activity_edit_credit_label()}
        <span className="font-normal text-faint"> · {m.report_panel_optional()}</span>
      </Label>
      <Input
        id={id}
        name="creditHours"
        type="number"
        inputMode="numeric"
        min={0}
        placeholder="0"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="max-w-30 tabular-nums"
      />
      <span className={helpClass}>{m.report_panel_credit_help()}</span>
    </div>
  )
}

function FormErrors({ errors }: { errors: string[] | undefined }) {
  if (!errors?.length) return null
  return (
    <p role="alert" className="text-danger-text text-sm">
      {errors.join(' ')}
    </p>
  )
}
