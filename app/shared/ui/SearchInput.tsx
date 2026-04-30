import { Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigation, useSearchParams } from 'react-router'

import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useDebouncedValue } from '~/shared/ui/hooks/use-debounced-value'
import { Input } from '~/shared/ui/input'

interface SearchInputProps {
  paramName?: string
  placeholder?: string
  delay?: number
}

export function SearchInput({ paramName = 'q', placeholder, delay = 300 }: SearchInputProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigation = useNavigation()
  const initialValue = searchParams.get(paramName) ?? ''
  const [value, setValue] = useState(initialValue)
  const debounced = useDebouncedValue(value, delay)
  const isSearching = navigation.state === 'loading' && value !== initialValue
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Skip the first render to avoid triggering a search on mount
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    setSearchParams(
      prev => {
        if (debounced) {
          prev.set(paramName, debounced)
        } else {
          prev.delete(paramName)
        }
        // Reset to page 1 on new search
        prev.delete('page')
        return prev
      },
      { replace: true },
    )
  }, [debounced, paramName, setSearchParams])

  // Sync external URL changes (e.g., browser back)
  const valueRef = useRef(value)
  valueRef.current = value
  useEffect(() => {
    const urlValue = searchParams.get(paramName) ?? ''
    if (urlValue !== valueRef.current) {
      setValue(urlValue)
    }
  }, [searchParams, paramName])

  return (
    <div className="relative flex-1">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="pr-9 pl-9"
      />
      {isSearching ? (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value.length > 0 && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
            onClick={() => setValue('')}
          >
            <X className="size-3.5" />
            <span className="sr-only">{m.common_clear()}</span>
          </Button>
        )
      )}
    </div>
  )
}
