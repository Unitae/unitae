import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Opens what one address parameter names (`?panel=emergency` on the publisher record, `?assign=part-12` on an event's
 * page), then drops it, so a reload does not open it again.
 */
export function useOpenParam(name: string, onOpen: (value: string) => void) {
  const [params, setParams] = useSearchParams()
  const value = params.get(name)

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per link; onOpen is fresh each render
  useEffect(() => {
    if (value == null || value === '') return
    onOpen(value)
    setParams(
      prev => {
        prev.delete(name)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )
  }, [value])
}
