import { X } from 'lucide-react'
import { useSearchParams } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

interface FilterBarProps {
  /**
   * URL query parameters this bar owns. Drives the "clear all" button
   * visibility and what it removes (pagination is always reset too).
   */
  paramNames: readonly string[]
  children: React.ReactNode
  className?: string
}

/**
 * Layout shell for a list page's filter row: search field, selects and other
 * controls flow as children; a clear button appears automatically as soon as
 * one of the owned URL parameters is set.
 */
export function FilterBar({ paramNames, children, className }: FilterBarProps) {
  const [params, setSearchParams] = useSearchParams()

  const hasActiveFilters = paramNames.some(name => {
    const value = params.get(name)
    return value != null && value !== '' && value !== 'none'
  })

  const clearAll = () => {
    setSearchParams(
      prev => {
        for (const name of paramNames) prev.delete(name)
        prev.delete('page')
        return prev
      },
      { replace: true },
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="size-3.5" />
          {m.filters_clear_all()}
        </Button>
      )}
    </div>
  )
}
