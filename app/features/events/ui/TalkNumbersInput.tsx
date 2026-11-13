import { X } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

const SEPARATORS = /[\s,;/]+/
const NON_DIGITS = /\D/g

interface TalkNumbersInputProps {
  id?: string
  /** Posts each number as a repeated input of that name, so a form reads them as a list. */
  name?: string
  defaultValue?: number[]
  /** Controlled: the numbers shown, kept by the caller through `onChange`. */
  value?: number[]
  onChange?: (talks: number[]) => void
  placeholder: string
  invalid?: boolean
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

/**
 * Talk outline numbers as tokens: type « 12, 54 102 » or one at a time, Enter or a comma adds, Backspace on an empty
 * field takes the last one back. In a form, each number is posted under `name`; elsewhere `value` and `onChange`
 * keep them.
 */
export function TalkNumbersInput({
  id,
  name,
  defaultValue = [],
  value,
  onChange,
  placeholder,
  invalid = false,
  disabled = false,
  className,
  ...rest
}: TalkNumbersInputProps) {
  const [own, setOwn] = useState<number[]>(defaultValue)
  const [draft, setDraft] = useState('')
  const talks = value ?? own
  const update = (next: number[]) => {
    if (value === undefined) setOwn(next)
    onChange?.(next)
  }

  const add = (text: string) => {
    const numbers = text
      .split(SEPARATORS)
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0)
    if (numbers.length === 0) return
    update([...new Set([...talks, ...numbers])].sort((a, b) => a - b))
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(draft)
    } else if (event.key === 'Backspace' && draft === '' && talks.length > 0) {
      update(talks.slice(0, -1))
    }
  }

  return (
    <div
      className={cn(
        'border-input bg-background focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 focus-within:ring-[3px]',
        invalid && 'border-destructive',
        disabled && 'opacity-50',
        className,
      )}
    >
      {talks.map(talk => (
        <span
          key={talk}
          className="bg-hover inline-flex h-6 items-center gap-1 rounded-sm pr-1 pl-2 text-xs font-medium tabular-nums"
        >
          {talk}
          {name != null && <input type="hidden" name={name} value={talk} />}
          <button
            type="button"
            disabled={disabled}
            className="text-faint hover:text-foreground rounded-sm"
            aria-label={m.external_speakers_field_talks_remove({ number: String(talk) })}
            onClick={() => update(talks.filter(each => each !== talk))}
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        inputMode="numeric"
        className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
        placeholder={talks.length === 0 ? placeholder : m.external_speakers_field_talks_add()}
        value={draft}
        onChange={event => {
          const value = event.target.value
          // A pasted or typed separator commits what came before it.
          if (SEPARATORS.test(value)) add(value)
          else setDraft(value.replace(NON_DIGITS, ''))
        }}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        disabled={disabled}
        aria-label={rest['aria-label']}
        aria-invalid={invalid || undefined}
      />
    </div>
  )
}
