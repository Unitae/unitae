import { Tag } from '@unitae/ui'
import { useId } from 'react'

import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { territoryKindLabel } from '~/features/territories/ui/my-territory-labels'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Textarea } from '~/shared/ui/textarea'
import { cn } from '~/shared/utils/utils'

import { contentText, entrancesCount, streetsCount } from './editor-labels'

interface EditorColumnHeaderProps {
  mode: 'new' | 'edit'
  number: string
  onNumber: (number: string) => void
  numberError: string | null
  kind: TerritoryKindKey
  kinds: TerritoryKindKey[]
  onKind: (kind: TerritoryKindKey) => void
  notes: string
  onNotes: (notes: string) => void
  content: { before: number; after: number }
  entrances: number
  streets: number
}

/**
 * The top of the editor's column. Editing: the number, renamed in place, the type, what the territory holds (and how
 * much it changes) and the notes. Creating: the number and the type, which decides the entrances the map offers.
 */
export function EditorColumnHeader(props: EditorColumnHeaderProps) {
  const { mode, number, onNumber, numberError, kind, content } = props
  const numberId = useId()
  const errorId = useId()
  const invalid = numberError != null

  if (mode === 'new') {
    return (
      <section className="flex flex-col gap-3 border-border border-b px-5 py-4.5">
        <h1 className="font-semibold text-xl tracking-tight">{m.territory_editor_new_heading()}</h1>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={numberId}>{m.territory_editor_number_field()}</Label>
            <Input
              id={numberId}
              name="number"
              value={number}
              onChange={event => onNumber(event.target.value)}
              autoComplete="off"
              required
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
              className="tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${numberId}-kind`}>{m.territory_editor_type_field()}</Label>
            <Select name="type" value={kind} onValueChange={value => props.onKind(value as TerritoryKindKey)}>
              <SelectTrigger id={`${numberId}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.kinds.map(option => (
                  <SelectItem key={option} value={option}>
                    {territoryKindLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {invalid && (
          <p id={errorId} className="-mt-1 text-destructive text-xs">
            {numberError}
          </p>
        )}
        <p className="-mt-1 text-faint text-xs leading-relaxed">{m.territory_editor_type_hint()}</p>
      </section>
    )
  }

  const delta = content.after - content.before
  return (
    <section className="flex flex-col gap-3 border-border border-b px-5 py-4.5">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-xl tracking-tight">{m.territory_editor_heading()}</span>
        <label htmlFor={numberId} className="sr-only">
          {m.territory_editor_number_label()}
        </label>
        <input
          id={numberId}
          name="number"
          value={number}
          onChange={event => onNumber(event.target.value)}
          title={m.territory_editor_rename()}
          autoComplete="off"
          required
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          className={cn(
            '-ml-1.5 w-28 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-semibold text-xl tabular-nums tracking-tight outline-none transition-colors duration-(--u-duration-fast) hover:border-border focus:border-ring focus:bg-surface',
            invalid && 'border-destructive',
          )}
        />
        <span className="flex-1" />
        <Tag>{territoryKindLabel(kind)}</Tag>
      </div>
      {invalid && (
        <p id={errorId} className="-mt-1.5 text-destructive text-xs">
          {numberError}
        </p>
      )}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-faint text-sm tabular-nums">
        <span>
          <span className="font-medium text-foreground">{contentText(kind, content.after)}</span>
          {delta !== 0 && (
            <>
              {' ('}
              <span className="font-medium text-brand-text">
                {m.territory_editor_delta({
                  delta: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`,
                  before: String(content.before),
                })}
              </span>
              {')'}
            </>
          )}
        </span>
        <span>{entrancesCount(props.entrances)}</span>
        {props.streets > 0 && <span>{streetsCount(props.streets)}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${numberId}-notes`}>
          {m.territory_editor_notes_label()}
          <span className="font-normal text-faint">{m.territory_editor_notes_hint()}</span>
        </Label>
        <Textarea
          id={`${numberId}-notes`}
          name="notes"
          rows={2}
          value={props.notes}
          onChange={event => props.onNotes(event.target.value)}
        />
      </div>
    </section>
  )
}
