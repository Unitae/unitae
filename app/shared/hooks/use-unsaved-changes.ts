import { useCallback, useEffect, useState } from 'react'
import { useBlocker, useNavigation } from 'react-router'

/**
 * Blocks navigation and tab close when the form has unsaved changes.
 * Returns the blocker state and a markDirty callback for form onChange.
 * Automatically resets dirty state when a form submission starts.
 */
export function useUnsavedChanges() {
  const [isDirty, setIsDirty] = useState(false)
  const navigation = useNavigation()

  useEffect(() => {
    if (navigation.state === 'submitting') {
      setIsDirty(false)
    }
  }, [navigation.state])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname,
  )

  // Warn on tab close / browser back
  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  const markDirty = useCallback(() => setIsDirty(true), [])

  return { blocker, markDirty }
}
