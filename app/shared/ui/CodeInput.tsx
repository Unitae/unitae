import { type ComponentProps, useEffect, useRef, useState } from 'react'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'

export const CODE_LENGTH = 6
const NOT_A_DIGIT = /\D/g

interface CodeInputProps extends Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange'> {
  /** Called once the sixth digit is in, typed or pasted: there is nothing else to press. */
  onComplete?: (code: string) => void
}

/** A 6-digit code from an authenticator app: digits only, centred, sent by its last digit. */
export function CodeInput({ onComplete, className, ...props }: CodeInputProps) {
  const [code, setCode] = useState('')
  const complete = useRef(onComplete)
  complete.current = onComplete

  useEffect(() => {
    if (code.length === CODE_LENGTH) complete.current?.(code)
  }, [code])

  return (
    // The tracking also follows the last digit: the left padding evens it out, so the code sits centred.
    <Input
      {...props}
      value={code}
      onChange={event => setCode(event.target.value.replace(NOT_A_DIGIT, '').slice(0, CODE_LENGTH))}
      autoComplete="one-time-code"
      inputMode="numeric"
      className={cn('h-13 pl-[0.45em] text-center font-medium text-2xl tabular-nums tracking-[0.45em]', className)}
    />
  )
}
