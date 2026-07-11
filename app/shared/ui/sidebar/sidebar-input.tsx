'use client'

import type * as React from 'react'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn('h-8 w-full bg-background shadow-none', className)}
      {...props}
    />
  )
}

export { SidebarInput }
