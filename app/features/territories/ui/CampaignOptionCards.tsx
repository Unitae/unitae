import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { cn } from '~/shared/utils/utils'

export interface CampaignOption {
  value: string
  label: string
  description: string
  /** A control under the choice while it is picked. */
  extra?: React.ReactNode
}

/**
 * Exclusive choices as cards, each with the one line saying what it does, so nobody picks an option to find out. A
 * disabled group keeps showing the choice made, for a campaign whose start has run.
 */
export function CampaignOptionCards({
  id,
  name,
  label,
  value,
  onValueChange,
  disabled = false,
  options,
}: {
  id: string
  /** Left out while disabled: hidden inputs then carry the value. */
  name?: string
  label: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  options: CampaignOption[]
}) {
  return (
    <RadioGroup
      name={name}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      aria-label={label}
      className="col-span-full gap-1.5"
    >
      {options.map(option => {
        const picked = value === option.value
        return (
          <label
            key={option.value}
            htmlFor={`${id}-${option.value}`}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors duration-(--u-duration-fast)',
              picked ? 'border-brand bg-brand-soft' : 'border-border hover:bg-hover',
              disabled && 'cursor-not-allowed opacity-70',
            )}
          >
            <RadioGroupItem id={`${id}-${option.value}`} value={option.value} className="mt-0.5" />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-medium text-sm">{option.label}</span>
              <span className="text-muted-foreground text-sm">{option.description}</span>
              {picked && option.extra}
            </span>
          </label>
        )
      })}
    </RadioGroup>
  )
}
