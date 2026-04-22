import { useCallback, useState } from 'react'

/**
 * Like useState but persists the value in localStorage.
 * Reads from localStorage on first render, writes on every update.
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue

    try {
      const stored = localStorage.getItem(key)
      return stored != null ? (JSON.parse(stored) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setPersistedState = useCallback(
    (value: T) => {
      setState(value)
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // localStorage full or unavailable — ignore silently
      }
    },
    [key],
  )

  return [state, setPersistedState]
}
