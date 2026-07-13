'use client'

import type * as React from 'react'
import { cn } from '~/shared/utils/utils'

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col p-1.5', className)}
      {...props}
    />
  )
}

export { SidebarGroup }
