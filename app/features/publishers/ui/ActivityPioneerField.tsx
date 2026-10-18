import type { MonthEnrolment } from '~/features/publishers/model/month-enrolment.type'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

const TYPE_SENTENCES: Record<PublisherType, () => string> = {
  [PublisherType.Normal]: m.activity_edit_pioneer_none,
  [PublisherType.PionnierAuxiliaires]: m.activity_edit_pioneer_auxiliary,
  [PublisherType.PionnierPermanant]: m.activity_edit_pioneer_permanent,
  [PublisherType.PionnierSpecial]: m.activity_edit_pioneer_special,
  [PublisherType.Missionnaire]: m.activity_edit_pioneer_missionary,
}

interface ActivityPioneerFieldProps {
  // The enrolment covering the reported month, if any. It decides the report's type, so the
  // form states it instead of asking.
  enrolment: MonthEnrolment | null
  // The types offered when no enrolment covers the month.
  options: PublisherType[]
  // The chosen type when no enrolment covers the month; ignored otherwise.
  value: PublisherType
  onChange: (type: PublisherType) => void
  // Edit form only: the type the report was saved with, so the field can say that saving
  // replaces it with the enrolment's type.
  recordedType?: PublisherType
}

export function ActivityPioneerField({ enrolment, options, value, onChange, recordedType }: ActivityPioneerFieldProps) {
  if (enrolment != null) {
    return (
      <div className="space-y-1 rounded-md bg-muted px-3 py-2 text-sm">
        <input type="hidden" name="type" value={enrolment.type} />
        <p className="font-medium">{TYPE_SENTENCES[enrolment.type]()}</p>
        <p className="text-muted-foreground">{m.activity_new_enrolment_goal({ goal: String(enrolment.goal) })}</p>
        {recordedType != null && recordedType !== enrolment.type && (
          <p className="text-muted-foreground">{m.activity_edit_type_follows_enrolment()}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="type">{m.activity_new_pioneer_label()}</Label>
      <Select name="type" value={value} onValueChange={type => onChange(type as PublisherType)}>
        <SelectTrigger id="type" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(type => (
            <SelectItem key={type} value={type}>
              {TYPE_SENTENCES[type]()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
