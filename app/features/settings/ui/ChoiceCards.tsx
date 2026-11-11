import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { cn } from '~/shared/utils/utils'

export interface Choice {
  value: string
  label: string
  description: string
}

interface ChoiceCardsProps {
  id: string
  name: string
  label: string
  defaultValue: string
  choices: Choice[]
}

/** Exclusive choices as cards, each with the line saying what it does, so nobody picks one to find out. */
export function ChoiceCards({ id, name, label, defaultValue, choices }: ChoiceCardsProps) {
  return (
    <RadioGroup name={name} defaultValue={defaultValue} aria-label={label} className="col-span-full gap-1.5">
      {choices.map(choice => (
        <label
          key={choice.value}
          htmlFor={`${id}-${choice.value}`}
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5 transition-colors duration-(--u-duration-fast) hover:bg-hover',
            'has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-soft',
          )}
        >
          <RadioGroupItem id={`${id}-${choice.value}`} value={choice.value} className="mt-0.5" />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="font-medium text-sm">{choice.label}</span>
            <span className="text-muted-foreground text-sm">{choice.description}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  )
}
