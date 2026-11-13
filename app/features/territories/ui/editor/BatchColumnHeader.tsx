import { useId } from 'react'
import { useSearchParams } from 'react-router'

import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { territoryKindLabel } from '~/features/territories/ui/my-territory-labels'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { accessLabel } from '../building-list-labels'

interface BatchColumnHeaderProps {
  number: string
  onNumber: (number: string) => void
  numberError: string | null
  /** After a refusal because the number was just taken: the next free one, to take in one press. */
  nextFree: string | null
  kind: TerritoryKindKey
  /** The types the tool can create, each with its free entrances (within the filters). */
  kinds: { kind: TerritoryKindKey; free: number }[]
  zips: string[]
  free: number
  withoutPosition: number
  showingWithoutPosition: boolean
  onToggleWithoutPosition: () => void
}

/**
 * The top of the bulk tool's column: the next territory's number and its type (each with its free entrances), the
 * filters that share the work out, and how many free entrances there are, with those no map can show.
 */
export function BatchColumnHeader(props: BatchColumnHeaderProps) {
  const { number, numberError, nextFree, kind, kinds, free, withoutPosition } = props
  const id = useId()
  const [params, setParams] = useSearchParams()
  const format = new Intl.NumberFormat(getLocale())
  const fields: FilterField[] = [
    ...(props.zips.length > 1
      ? [
          {
            param: 'zip',
            label: m.prospection_filter_zip(),
            allLabel: m.prospection_filter_zip_all(),
            options: props.zips.map(zip => ({ value: zip, label: zip })),
          },
        ]
      : []),
    {
      param: 'access',
      label: m.prospection_filter_access(),
      allLabel: m.prospection_filter_access_all(),
      options: [TerritoryAccess.Intercom, TerritoryAccess.Code, TerritoryAccess.Doorbell].map(access => ({
        value: String(access),
        label: accessLabel(access) ?? '',
      })),
    },
  ]
  const chooseKind = (next: string) =>
    setParams(
      prev => {
        prev.set('type', next)
        return prev
      },
      { preventScrollReset: true },
    )

  return (
    <section className="flex flex-col gap-3 border-border border-b px-5 py-4.5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-semibold text-xl tracking-tight">{m.split_tool_heading()}</h1>
        <p className="text-muted-foreground text-sm">{m.split_tool_intro()}</p>
      </div>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-number`}>{m.split_tool_number_field()}</Label>
          <Input
            id={`${id}-number`}
            value={number}
            onChange={event => props.onNumber(event.target.value)}
            autoComplete="off"
            required
            aria-invalid={numberError != null}
            aria-describedby={numberError != null ? `${id}-error` : undefined}
            className="tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-kind`}>{m.territory_editor_type_field()}</Label>
          <Select value={kind} onValueChange={chooseKind}>
            <SelectTrigger id={`${id}-kind`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kinds.map(option => (
                <SelectItem key={option.kind} value={option.kind}>
                  <span className="flex w-full items-center justify-between gap-4">
                    {territoryKindLabel(option.kind)}
                    <span className="text-faint tabular-nums">
                      {m.split_tool_free_count({ count: format.format(option.free) })}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {numberError != null && (
        <p id={`${id}-error`} className="-mt-1 text-destructive text-xs">
          {numberError}{' '}
          {nextFree != null && (
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => props.onNumber(nextFree)}
            >
              {m.split_tool_take_number({ number: nextFree })}
            </button>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <FiltersPopover fields={fields} />
        <div className="min-w-0 flex-1">
          <SearchInput paramName="street" placeholder={m.split_tool_street_placeholder()} />
        </div>
      </div>
      <FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-faint text-sm tabular-nums">
        <span>
          <span className="font-medium text-foreground">{m.split_tool_free_line({ count: format.format(free) })}</span>
        </span>
        {withoutPosition > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 tabular-nums"
              aria-expanded={props.showingWithoutPosition}
              onClick={props.onToggleWithoutPosition}
            >
              {m.split_tool_without_position({ count: format.format(withoutPosition) })}
            </Button>
          </>
        )}
      </p>
    </section>
  )
}
