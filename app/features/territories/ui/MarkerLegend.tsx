import { Check, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as m from '~/paraglide/messages'

const LEGEND_KEY = 'unitae_map_legend_open'

type LegendRow = { label: string; bg: string; border: string; icon: React.ReactNode; ring?: boolean }

function legendRows(): LegendRow[] {
  return [
    {
      label: m.territories_map_legend_in_territory(),
      bg: 'bg-blue-600',
      border: 'border-blue-700',
      icon: <Check className="size-2.5 text-white" strokeWidth={3} aria-hidden="true" />,
    },
    {
      label: m.territories_map_legend_available(),
      bg: 'bg-emerald-500',
      border: 'border-emerald-700',
      icon: null,
    },
    {
      label: m.territories_map_legend_on_other(),
      bg: 'bg-white',
      border: 'border-slate-400',
      icon: null,
    },
    {
      label: m.territories_map_legend_pending_add(),
      bg: 'bg-blue-600',
      border: 'border-blue-700',
      icon: <Plus className="size-2.5 text-white" strokeWidth={3} aria-hidden="true" />,
      ring: true,
    },
    {
      label: m.territories_map_legend_pending_remove(),
      bg: 'bg-destructive',
      border: 'border-destructive',
      icon: <X className="size-2.5 text-white" strokeWidth={3} aria-hidden="true" />,
    },
  ]
}

export default function MarkerLegend() {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(LEGEND_KEY)
    if (stored === 'false') setOpen(false)
  }, [])

  const toggle = () => {
    setOpen(prev => {
      const next = !prev
      localStorage.setItem(LEGEND_KEY, String(next))
      return next
    })
  }

  return (
    <div className="pointer-events-auto flex w-fit flex-col gap-1.5 rounded-md border bg-card/95 p-2 text-xs shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 rounded font-semibold hover:text-primary"
        aria-expanded={open}
      >
        {m.territories_map_legend_title()}
        {open ? (
          <ChevronUp className="size-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3" aria-hidden="true" />
        )}
      </button>
      {open ? (
        <ul className="flex flex-col gap-1.5">
          {legendRows().map(row => (
            <li key={row.label} className="flex items-center gap-2">
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${row.bg} ${row.border} ${row.ring ? 'ring-2 ring-blue-300 ring-offset-1' : ''}`}
                aria-hidden="true"
              >
                {row.icon}
              </span>
              <span>{row.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
