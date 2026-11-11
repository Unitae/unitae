import { Tag } from '@unitae/ui'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { ListSpeakerFields } from '~/features/events/model/speaker-list.type'
import type { ListRow } from '~/features/events/model/speaker-list-diff'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'
import type { SpeakerListUpdateState } from './use-speaker-list-update'

// The rows of a list update: each speaker as the new list gives him, editable, with what changed and the value
// before. A retired row is struck through and can be kept; a name known elsewhere asks « le même frère ? ».

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3 text-left font-medium text-faint text-sm'
const CELL = 'border-border border-b px-3 py-2 align-top'
const TALK_SEPARATORS = /[\s,;/]+/

function parseTalks(text: string): number[] {
  return [
    ...new Set(
      text
        .split(TALK_SEPARATORS)
        .map(Number)
        .filter(n => Number.isInteger(n) && n > 0),
    ),
  ].sort((a, b) => a - b)
}

function statusOf(
  row: ListRow,
  changed: (keyof ListSpeakerFields)[],
  answer: 'move' | 'new' | undefined,
  compared: boolean,
): { label: string; tone?: string } | null {
  if (row.status === 'retired')
    return row.keep
      ? { label: m.external_speakers_update_tag_kept() }
      : { label: m.external_speakers_update_tag_retired(), tone: 'danger' }
  if (row.status === 'returning') return { label: m.external_speakers_update_tag_returning(), tone: 'brand' }
  if (row.status === 'new') return { label: m.external_speakers_update_tag_new(), tone: 'brand' }
  if (row.status === 'elsewhere') {
    const congregation = row.elsewhere?.congregationName ?? ''
    if (answer === 'move') return { label: m.external_speakers_update_tag_moving({ congregation }) }
    if (answer === 'new') return { label: m.external_speakers_update_tag_new(), tone: 'brand' }
    return { label: m.external_speakers_update_tag_elsewhere({ congregation }), tone: 'warning' }
  }
  if (changed.length > 0) return { label: m.external_speakers_update_tag_changed() }
  // Nothing compared yet: an untouched row says nothing.
  return compared ? { label: m.external_speakers_update_tag_unchanged() } : null
}

const TONE: Record<string, string> = {
  danger: 'bg-danger-soft text-danger-text border-transparent',
  warning: 'bg-warning-soft text-warning-text border-transparent',
  brand: '',
}

function Was({ show, value }: { show: boolean; value: string }) {
  if (!show || value === '') return null
  return (
    <span className="text-faint mt-0.5 block text-xs line-through">{m.external_speakers_update_was({ value })}</span>
  )
}

export function SpeakerListRowsTable({ state }: { state: SpeakerListUpdateState }) {
  const { rows, answers } = state
  // Second phones and e-mails show only when there is one, or once asked for: no grid of empty boxes.
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const open = (key: string) => setOpened(previous => new Set(previous).add(key))
  return (
    <div className="border-border bg-card overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
        <thead>
          <tr>
            <th className={cn(HEAD, 'w-[30%]')}>{m.external_speakers_col_speaker()}</th>
            <th className={cn(HEAD, 'w-[20%]')}>{m.external_speakers_update_col_phones()}</th>
            <th className={cn(HEAD, 'w-[26%]')}>{m.external_speakers_update_col_emails()}</th>
            <th className={HEAD}>{m.external_speakers_update_col_talks()}</th>
            <th className={cn(HEAD, 'w-24')}>
              <span className="sr-only">{m.external_speakers_retire_confirm()}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const changed = state.rowChanges(row)
            const status = statusOf(row, changed, answers[row.key], state.compared)
            const out = row.status === 'retired' && !row.keep
            const locked = row.status === 'retired'
            const field = (name: 'name' | 'phone' | 'phone2' | 'email' | 'email2', label: string) => (
              <Input
                value={row.fields[name]}
                onChange={event => state.setField(row.key, name, event.target.value)}
                disabled={locked}
                aria-label={label}
                className={cn('bg-card h-8', out && 'line-through')}
              />
            )
            const second = (name: 'phone2' | 'email2', label: string, add: string) =>
              row.fields[name] !== '' || (row.before?.[name] ?? '') !== '' || opened.has(`${row.key}:${name}`) ? (
                field(name, label)
              ) : locked ? null : (
                <button
                  type="button"
                  className="text-faint hover:text-foreground inline-flex items-center gap-1 self-start text-xs"
                  onClick={() => open(`${row.key}:${name}`)}
                >
                  <Plus aria-hidden="true" className="size-3" />
                  {add}
                </button>
              )
            return (
              <tr
                key={row.key}
                className={cn(
                  out && 'bg-danger-soft/40',
                  (row.status === 'new' || answers[row.key] === 'new') && 'bg-selected/60',
                  row.status === 'elsewhere' && answers[row.key] == null && 'bg-warning-soft/50',
                )}
              >
                <td className={CELL}>
                  {field('name', m.external_speakers_field_name())}
                  {status && (
                    <span className="mt-1.5 flex">
                      <Tag
                        tone={status.tone === 'brand' ? 'brand' : 'neutral'}
                        className={TONE[status.tone ?? ''] ?? ''}
                      >
                        {status.label}
                      </Tag>
                    </span>
                  )}
                  {row.status === 'retired' && !row.keep && (
                    <p className="text-faint mt-1 text-xs">{m.external_speakers_update_note_retired()}</p>
                  )}
                  {row.status === 'returning' && (
                    <p className="text-faint mt-1 text-xs">{m.external_speakers_update_note_returning()}</p>
                  )}
                  {row.status === 'elsewhere' && row.elsewhere && (
                    <div className="mt-1 flex flex-col gap-1.5">
                      <p className="text-muted-foreground text-xs">
                        {answers[row.key] === 'move'
                          ? m.external_speakers_update_note_moving({ congregation: row.elsewhere.congregationName })
                          : m.external_speakers_update_note_elsewhere({
                              name: row.fields.name,
                              congregation: row.elsewhere.congregationName,
                            })}
                      </p>
                      <span className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={answers[row.key] === 'move' ? 'default' : 'outline'}
                          onClick={() => state.answer(row.key, 'move')}
                        >
                          {m.external_speakers_update_same()}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={answers[row.key] === 'new' ? 'default' : 'ghost'}
                          onClick={() => state.answer(row.key, 'new')}
                        >
                          {m.external_speakers_update_other()}
                        </Button>
                      </span>
                    </div>
                  )}
                </td>
                <td className={CELL}>
                  <span className="flex flex-col gap-1">
                    {field('phone', m.external_speakers_field_phone())}
                    <Was show={changed.includes('phone')} value={row.before?.phone ?? ''} />
                    {second('phone2', m.external_speakers_field_phone2(), m.external_speakers_add_phone2())}
                    <Was show={changed.includes('phone2')} value={row.before?.phone2 ?? ''} />
                  </span>
                </td>
                <td className={CELL}>
                  <span className="flex flex-col gap-1">
                    {field('email', m.external_speakers_field_email())}
                    <Was show={changed.includes('email')} value={row.before?.email ?? ''} />
                    {second('email2', m.external_speakers_field_email2(), m.external_speakers_add_email2())}
                    <Was show={changed.includes('email2')} value={row.before?.email2 ?? ''} />
                  </span>
                </td>
                <td className={CELL}>
                  <Input
                    key={`${row.key}-${row.fields.talks.join(',')}`}
                    defaultValue={row.fields.talks.join(', ')}
                    placeholder={m.external_speakers_update_talks_placeholder()}
                    onBlur={event => state.setField(row.key, 'talks', parseTalks(event.target.value))}
                    disabled={locked}
                    inputMode="numeric"
                    aria-label={m.external_speakers_field_talks()}
                    className={cn('bg-card h-8 tabular-nums', out && 'line-through')}
                  />
                  <Was show={changed.includes('talks')} value={row.before?.talks.join(', ') ?? ''} />
                </td>
                <td className={cn(CELL, 'text-right')}>
                  {row.status === 'retired' ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => state.toggleRow(row.key)}>
                      {row.keep ? m.external_speakers_retire_confirm() : m.external_speakers_update_undo()}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={m.external_speakers_update_remove_row({ name: row.fields.name || '—' })}
                      onClick={() => state.toggleRow(row.key)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
          <tr>
            <td colSpan={5} className="px-3 py-2">
              <Button type="button" variant="ghost" size="sm" onClick={state.addRow}>
                <Plus aria-hidden="true" />
                {m.external_speakers_update_add_row()}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
