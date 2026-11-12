'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/shared/ui/tooltip'
import { cn } from '~/shared/utils/utils'
import { useSidebar } from './sidebar-context'

const sidebarMenuButtonVariants = cva(
  'peer/menu-button relative flex w-full items-center gap-2.5 overflow-hidden rounded-md px-2 py-1.5 text-left font-medium text-muted-foreground text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding,background-color,color] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-hover hover:text-foreground focus-visible:ring-2 active:bg-hover active:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-selected data-[active=true]:text-foreground data-[active=true]:[&>svg]:text-brand aria-[current=page]:bg-selected aria-[current=page]:text-foreground aria-[current=page]:[&>svg]:text-brand data-[state=open]:hover:bg-hover data-[state=open]:hover:text-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-faint',
  {
    variants: {
      variant: {
        default: 'hover:bg-hover hover:text-foreground',
        outline:
          'bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]',
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = 'default',
  size = 'default',
  tooltip,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : 'button'
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === 'string') {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center" hidden={state !== 'collapsed' || isMobile} {...tooltip} />
    </Tooltip>
  )
}

export { SidebarMenuButton, sidebarMenuButtonVariants }
