import { useCallback, useEffect, useState } from 'react'

/**
 * Like useState but persists the value in localStorage.
 * Initializes with defaultValue (SSR-safe), syncs from localStorage after mount.
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(defaultValue)

  // Sync from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored != null) {
        setState(JSON.parse(stored) as T)
      }
    } catch {
      // localStorage unavailable or corrupted — keep defaultValue
    }
  }, [key])

  const setPersistedState = useCallback(
    (value: T) => {
      setState(value)
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // localStorage full or unavailable
      }
    },
    [key],
  )

  return [state, setPersistedState]
}
