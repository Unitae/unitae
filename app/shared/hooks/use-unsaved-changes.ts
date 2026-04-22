import { useEffect } from 'react'
import { useBlocker } from 'react-router'

/**
 * Blocks navigation and tab close when the form has unsaved changes.
 * Returns the blocker state for rendering a confirmation dialog.
 */
export function useUnsavedChanges(isDirty: boolean) {
  const blocker = useBlocker(isDirty)

  // Warn on tab close / browser back
  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  return blocker
}
