import { useEffect, useState } from 'react'

/**
 * Whether a media query matches, kept current as the window changes. `undefined` until mounted: the server cannot
 * know, so render nothing that depends on it before the first effect.
 */
export function useMediaQuery(query: string): boolean | undefined {
  const [matches, setMatches] = useState<boolean>()

  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])

  return matches
}
