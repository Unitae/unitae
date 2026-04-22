import { Loader2 } from 'lucide-react'
import type * as React from 'react'
import { useNavigation } from 'react-router'

import { Button } from '~/shared/ui/button'

interface SubmitButtonProps extends React.ComponentProps<typeof Button> {
  submittingLabel?: string
}

export function SubmitButton({ children, submittingLabel, disabled, ...props }: SubmitButtonProps) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <Button type="submit" disabled={disabled || isSubmitting} {...props}>
      {isSubmitting ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {submittingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
