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
