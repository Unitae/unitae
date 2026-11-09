import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Opens the report named in the address (`?open=<publisherId>`, plus `month` and `year` where the page has no month of
 * its own), then drops those parameters. The old report pages redirect here with it.
 */
export function useOpenFromLink(onOpen: (publisherId: number, params: URLSearchParams) => void, drop: string[] = []) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('open')

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per link; onOpen and drop are fresh each render
  useEffect(() => {
    const id = Number(raw)
    if (raw == null || !Number.isInteger(id) || id <= 0) return
    onOpen(id, params)
    setParams(
      prev => {
        for (const name of ['open', ...drop]) prev.delete(name)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )
  }, [raw])
}

/**
 * Opens what one address parameter names (`?panel=emergency` on the record, `?visit=<memberId>` on the group page), then
 * drops it, so a reload does not open it again. The old emergency and visit pages redirect here with it.
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
