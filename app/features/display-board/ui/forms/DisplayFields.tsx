import { FormSection, SegmentedControl } from '@unitae/ui'
import { X } from 'lucide-react'
import { useState } from 'react'
import type { DisplayWindowInput, ShowChoice } from '~/features/display-board/model/display-window'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DateInput } from '~/shared/ui/DateInput'
import { Label } from '~/shared/ui/label'
import { Switch } from '~/shared/ui/switch'

export interface DisplayFieldErrors {
  from?: string[]
  until?: string[]
}

interface DisplayFieldsProps {
  defaults: DisplayWindowInput
  highlighted: boolean
  /** How many other documents are « à la une » already. */
  highlightedOthers: number
  errors?: DisplayFieldErrors
  /** The day it leaves the board as chosen so far, `''` for never: for the card beside the form. */
  onUntilChange?: (until: string) => void
}

function othersText(count: number): string {
  if (count === 0) return m.board_form_highlight_others_none()
  return m.board_form_highlight_others({ count })
}

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null
  return (
    <p id={id} className="text-destructive text-sm">
      {errors[0]}
    </p>
  )
}

/**
 * When a document is on the board: « Afficher » now, from a day, or not yet; the day it leaves, or
 * never; and « À la une ». Days are read in the congregation's zone by the server.
 */
export function DisplayFields({ defaults, highlighted, highlightedOthers, errors, onUntilChange }: DisplayFieldsProps) {
  const [show, setShow] = useState<ShowChoice>(defaults.show)
  const [until, setUntil] = useState(defaults.until)
  const changeUntil = (value: string) => {
    setUntil(value)
    onUntilChange?.(value)
  }
  const options = [
    { value: 'now' as const, label: m.board_form_show_now() },
    { value: 'from' as const, label: m.board_form_show_from() },
    { value: 'later' as const, label: m.board_form_show_later() },
  ]

  return (
    <FormSection title={m.board_form_display_title()} description={m.board_form_display_description()}>
      <div className="col-span-full flex flex-col items-start gap-2">
        <span className="font-medium text-sm">{m.board_form_show_label()}</span>
        <input type="hidden" name="show" value={show} />
        <SegmentedControl
          options={options}
          value={show}
          onValueChange={setShow}
          aria-label={m.board_form_show_label()}
        />
        {show === 'later' && <p className="text-muted-foreground text-sm">{m.board_form_show_later_help()}</p>}
      </div>

      {show === 'from' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="display-from">{m.board_form_from_label()}</Label>
          <DateInput
            id="display-from"
            name="from"
            defaultValue={defaults.from || null}
            aria-invalid={errors?.from ? true : undefined}
            aria-describedby={errors?.from ? 'display-from-error' : 'display-from-help'}
          />
          <p id="display-from-help" className="text-muted-foreground text-sm">
            {m.board_form_from_help()}
          </p>
          <FieldError id="display-from-error" errors={errors?.from} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="display-until">{m.board_form_until_label()}</Label>
        <DateInput
          id="display-until"
          name="until"
          value={until || null}
          onChange={next => changeUntil(next ?? '')}
          aria-invalid={errors?.until ? true : undefined}
          aria-describedby={errors?.until ? 'display-until-error' : 'display-until-help'}
        />
        <p id="display-until-help" className="text-muted-foreground text-sm">
          {until === '' ? m.board_form_until_never_help() : m.board_form_until_help()}
        </p>
        <FieldError id="display-until-error" errors={errors?.until} />
      </div>
      {until !== '' && (
        <div className="flex items-start pt-7">
          <Button type="button" variant="ghost" size="sm" onClick={() => changeUntil('')}>
            <X className="size-4" aria-hidden="true" />
            {m.board_form_until_never()}
          </Button>
        </div>
      )}

      <div className="col-span-full flex items-start gap-3 pt-1">
        <Switch
          id="display-highlighted"
          name="highlighted"
          value="on"
          defaultChecked={highlighted}
          className="mt-0.5"
        />
        <Label htmlFor="display-highlighted" className="flex flex-col items-start gap-0.5 font-normal">
          <span className="font-medium">{m.board_form_highlight_label()}</span>
          <span className="text-muted-foreground text-sm">
            {m.board_form_highlight_help()} {othersText(highlightedOthers)}
          </span>
        </Label>
      </div>
    </FormSection>
  )
}
