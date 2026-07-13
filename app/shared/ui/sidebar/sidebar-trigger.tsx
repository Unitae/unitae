'use client'

import { PanelLeftIcon } from 'lucide-react'
import type * as React from 'react'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'
import { useSidebar } from './sidebar-context'

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn('size-7', className)}
      onClick={event => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

export { SidebarTrigger }
