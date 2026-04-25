import type * as React from 'react'

import { cn } from '~/shared/utils/utils'

function Progress({ className, value = 0, ...props }: React.ComponentProps<'div'> & { value?: number }) {
  return (
    <div
      data-slot="progress"
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export { Progress }
