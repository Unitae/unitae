import type * as React from 'react'

import { cn } from '~/shared/utils/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('flex flex-col gap-4 rounded-2xl border bg-card py-5 text-card-foreground', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] sm:px-6 [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

// A card title is semantically a section heading, so it defaults to <h2> —
// correct under the app's single page <h1> (PageHeader / dashboard hero); pass
// `as` for a different level. Tailwind preflight resets heading size/margin, so
// this changes only the accessibility tree, not the visuals.
function CardTitle({
  className,
  as: Comp = 'h2',
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div' }) {
  return (
    <Comp
      data-slot="card-title"
      className={cn('font-display font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-muted-foreground text-sm', className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-4 sm:px-6', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-4 sm:px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
