import { X } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

const SEPARATORS = /[\s,;/]+/
const NON_DIGITS = /\D/g

/**
 * Talk outline numbers as tokens: type « 12, 54 102 » or one at a time, Enter or a comma adds, Backspace on an empty
 * field takes the last one back. Each number is posted as a repeated `name` input, so the form reads them as a list.
 */
export function TalkNumbersInput({
  id,
  name,
  defaultValue,
  placeholder,
  invalid = false,
}: {
  id: string
  name: string
  defaultValue: number[]
  placeholder: string
  invalid?: boolean
}) {
  const [talks, setTalks] = useState<number[]>(defaultValue)
  const [draft, setDraft] = useState('')

  const add = (text: string) => {
    const numbers = text
      .split(SEPARATORS)
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0)
    if (numbers.length === 0) return
    setTalks(previous => [...new Set([...previous, ...numbers])].sort((a, b) => a - b))
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(draft)
    } else if (event.key === 'Backspace' && draft === '' && talks.length > 0) {
      setTalks(previous => previous.slice(0, -1))
    }
  }

  return (
    <div
      className={cn(
        'border-input bg-background focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 focus-within:ring-[3px]',
        invalid && 'border-destructive',
      )}
    >
      {talks.map(talk => (
        <span
          key={talk}
          className="bg-hover inline-flex h-6 items-center gap-1 rounded-sm pr-1 pl-2 text-xs font-medium tabular-nums"
        >
          {talk}
          <input type="hidden" name={name} value={talk} />
          <button
            type="button"
            className="text-faint hover:text-foreground rounded-sm"
            aria-label={m.external_speakers_field_talks_remove({ number: String(talk) })}
            onClick={() => setTalks(previous => previous.filter(each => each !== talk))}
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
        aria-invalid={invalid || undefined}
      />
    </div>
  )
}
