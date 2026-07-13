import { describe, expect, it } from 'vitest'
import { sidebarMenuButtonVariants } from './sidebar-menu-button'

describe('sidebarMenuButtonVariants', () => {
  it('returns default classes when called without variants', () => {
    const result = sidebarMenuButtonVariants({})
    expect(result).toContain('hover:bg-sidebar-accent')
    expect(result).toContain('h-8')
    expect(result).toContain('text-sm')
  })

  it('applies the outline variant', () => {
    const result = sidebarMenuButtonVariants({ variant: 'outline' })
    expect(result).toContain('bg-background')
    expect(result).toContain('shadow-')
  })

  it('applies the small size', () => {
    const result = sidebarMenuButtonVariants({ size: 'sm' })
    expect(result).toContain('h-7')
    expect(result).toContain('text-xs')
  })

  it('applies the large size', () => {
    const result = sidebarMenuButtonVariants({ size: 'lg' })
    expect(result).toContain('h-12')
    expect(result).toContain('group-data-[collapsible=icon]:p-0')
  })
})
