import { Check } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'

const PALETTE: { hex: string; label: string }[] = [
  { hex: '#C2175B', label: 'Rose' },
  { hex: '#0E9A6C', label: 'Vert' },
  { hex: '#2289BC', label: 'Bleu' },
  { hex: '#E6B32F', label: 'Jaune' },
  { hex: '#7E3FF2', label: 'Violet' },
  { hex: '#E45A2B', label: 'Orange' },
  { hex: '#0F766E', label: 'Sarcelle' },
  { hex: '#475569', label: 'Ardoise' },
]

type Props = {
  value: string
  onChange: (value: string) => void
  id?: string
  ariaLabel?: string
}

export function ColorPicker({ value, onChange, id, ariaLabel }: Props) {
  const presetIndex = PALETTE.findIndex(p => p.hex.toLowerCase() === value.toLowerCase())
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel ?? m.settings_territories_card_overlays_color_label()}
          className="flex h-10 items-center gap-2 px-2"
        >
          <span aria-hidden className="size-6 rounded-sm border" style={{ backgroundColor: value }} />
          <span className="font-mono text-xs uppercase">{value}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">{m.settings_territories_card_overlays_color_palette_label()}</Label>
          <div className="grid grid-cols-4 gap-2">
            {PALETTE.map((preset, idx) => {
              const selected = presetIndex === idx
              return (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => onChange(preset.hex)}
                  aria-label={preset.label}
                  aria-pressed={selected}
                  className="relative flex aspect-square items-center justify-center rounded border transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring"
                  style={{ backgroundColor: preset.hex }}
                >
                  {selected ? <Check className="size-4 text-white drop-shadow" aria-hidden /> : null}
                </button>
              )
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id != null ? `${id}-custom` : undefined} className="text-xs">
            {m.settings_territories_card_overlays_color_custom()}
          </Label>
          <Input
            id={id != null ? `${id}-custom` : undefined}
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="h-10 w-full cursor-pointer p-1"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
