import { Plus, X } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'

const SEPARATORS = /[\s,;]+/

interface ZipChipsProps {
  id: string
  /** The form field: the codes joined by commas, as the settings store them. */
  name: string
  defaultValue: string
}

/** The postal codes as chips, with a field to add more (several at once, separated by spaces or commas). */
export function ZipChips({ id, name, defaultValue }: ZipChipsProps) {
  const [zips, setZips] = useState(() => defaultValue.split(SEPARATORS).filter(Boolean))
  const [draft, setDraft] = useState('')

  function add() {
    const fresh = draft.split(SEPARATORS).filter(zip => zip !== '' && !zips.includes(zip))
    if (fresh.length > 0) setZips([...zips, ...fresh])
    setDraft('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    // Enter adds the code; it must not submit the whole form.
    event.preventDefault()
    add()
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={name} value={zips.join(',')} />
      {zips.map(zip => (
        <span
          key={zip}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-hover pr-1 pl-2.5 text-sm tabular-nums"
        >
          {zip}
          <button
            type="button"
            onClick={() => setZips(zips.filter(each => each !== zip))}
            aria-label={m.settings_territories_zips_remove({ zip })}
            className="grid size-6 place-content-center rounded text-faint hover:bg-selected hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <Input
          id={id}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          inputMode="numeric"
          placeholder={m.settings_territories_zips_placeholder()}
          className="h-8 w-24"
        />
        <Button type="button" variant="ghost" size="sm" onClick={add} disabled={draft.trim() === ''}>
          <Plus aria-hidden="true" />
          {m.settings_territories_zips_add()}
        </Button>
      </span>
    </div>
  )
}
