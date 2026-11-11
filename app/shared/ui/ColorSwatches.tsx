import { categorical } from '@unitae/tokens'
import { Check } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

const NAMES = [
  m.color_swatch_blue,
  m.color_swatch_orange,
  m.color_swatch_teal,
  m.color_swatch_yellow,
  m.color_swatch_pink,
  m.color_swatch_green,
  m.color_swatch_purple,
  m.color_swatch_red,
]

/** The eight colours things can be given: the design system's categorical hues, as the light theme draws them. */
export const SWATCHES: readonly { hex: string; label: () => string }[] = categorical.light.map((hex, index) => ({
  hex,
  label: NAMES[index] ?? (() => hex),
}))

export const DEFAULT_SWATCH = SWATCHES[0]?.hex ?? '#0083a7'

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

interface ColorSwatchesProps {
  /** Names the group for assistive technologies, e.g. « Couleur ». */
  label: string
  /** The form field, for an uncontrolled use inside a form. */
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (hex: string) => void
  className?: string
}

/**
 * A colour picked among the eight swatches. A colour chosen before the palette existed keeps showing, first and
 * selected, until another is picked.
 */
export function ColorSwatches({ label, name, value, defaultValue, onChange, className }: ColorSwatchesProps) {
  const current = value ?? defaultValue ?? DEFAULT_SWATCH
  const offPalette = !SWATCHES.some(swatch => same(swatch.hex, current))
  const options = offPalette
    ? [{ hex: current, label: () => m.color_swatch_current({ hex: current.toUpperCase() }) }, ...SWATCHES]
    : SWATCHES

  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {options.map(option => {
        const controlled = value !== undefined
        return (
          <label key={option.hex} className="relative grid size-7 cursor-pointer place-content-center">
            <input
              type="radio"
              name={name}
              value={option.hex}
              aria-label={option.label()}
              {...(controlled
                ? { checked: same(option.hex, current), onChange: () => onChange?.(option.hex) }
                : { defaultChecked: same(option.hex, current), onChange: () => onChange?.(option.hex) })}
              className="peer absolute inset-0 cursor-pointer appearance-none rounded-full outline-none"
            />
            <span
              aria-hidden="true"
              className="grid size-6 place-content-center rounded-full ring-offset-2 ring-offset-background transition-shadow duration-(--u-duration-fast) peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring [&>svg]:hidden peer-checked:[&>svg]:block"
              style={{ backgroundColor: option.hex }}
            >
              <Check className="size-3.5 text-white drop-shadow" />
            </span>
          </label>
        )
      })}
    </div>
  )
}
