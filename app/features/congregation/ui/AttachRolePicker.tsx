import { Plus, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import type { OffChartRole } from '~/features/congregation/model/organigram-page.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'

// « Ajouter un rôle en dessous »: a role that exists outside the chart, attached in one tap, or a new name, which
// opens the new-role dialog with its place already chosen.

const DIACRITICS = /\p{Diacritic}/gu

const normalize = (value: string) => value.normalize('NFD').replace(DIACRITICS, '').toLocaleLowerCase().trim()

export function AttachRolePicker({
  parent,
  offChart,
  onCreate,
  onAttached,
}: {
  parent: { id: number; name: string }
  offChart: OffChartRole[]
  /** A new name: the new-role dialog takes over, under `parent`. */
  onCreate: (name: string) => void
  /** The attached role, whose panel opens next. */
  onAttached: (roleId: number) => void
}) {
  const fetcher = useFetcher<{ ok: boolean; roleId?: number }>()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const attached = useRef(onAttached)
  attached.current = onAttached

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok && fetcher.data.roleId != null)
      attached.current(fetcher.data.roleId)
  }, [fetcher.state, fetcher.data])

  const wanted = normalize(query)
  const matches = offChart.filter(role => normalize(role.name).includes(wanted))
  const exact = offChart.some(role => normalize(role.name) === wanted)

  const attach = (roleId: number) => {
    fetcher.submit({ intent: 'add', roleId: String(roleId), parentRoleId: String(parent.id) }, { method: 'post' })
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={fetcher.state !== 'idle'}>
          <Plus aria-hidden="true" />
          {m.org_add_under()}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2 p-2">
        <div className="relative">
          <Search aria-hidden="true" className="text-faint absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={m.org_attach_search()}
            aria-label={m.org_attach_search()}
            className="pl-8"
            autoComplete="off"
          />
        </div>
        <ul className="flex max-h-64 flex-col overflow-y-auto">
          {matches.map(role => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => attach(role.id)}
                className="hover:bg-hover focus-visible:bg-hover focus-visible:ring-ring flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2"
              >
                <span className="min-w-0 flex-1 truncate">{role.name}</span>
                <span className="text-faint shrink-0 text-xs tabular-nums">
                  {m.org_attach_holders({ count: role.holderCount })}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && wanted === '' && (
            <li className="text-muted-foreground px-2 py-1.5 text-sm">{m.org_attach_none()}</li>
          )}
          {wanted !== '' && !exact && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onCreate(query.trim())
                  setQuery('')
                }}
                className="text-primary hover:bg-hover focus-visible:bg-hover focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium outline-none focus-visible:ring-2"
              >
                <Plus aria-hidden="true" className="size-4" />
                {m.org_attach_create({ name: query.trim() })}
              </button>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
