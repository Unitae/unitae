import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigation } from 'react-router'

/**
 * Blocks navigation and tab close when the form has unsaved changes.
 * Returns the blocker state and a markDirty callback for form onChange, or setDirty for a form that
 * knows when it is back to what it loaded.
 * Automatically resets dirty state when a form submission starts.
 *
 * `param` names a search parameter that opens an item on the same page (`?type=` on « Types d’évènement »): moving to
 * another value, or none, leaves the item as surely as leaving the page, and asks first too.
 */
export function useUnsavedChanges(param?: string) {
  const [isDirty, setIsDirty] = useState(false)
  // What the tab-close warning reads. A submission clears it at once: React Router commits the
  // 'submitting' state in a transition, and an action answering with redirectDocument can unload
  // the page before that commit, which warned about a form that had just been saved.
  const hasUnsavedChanges = useRef(false)
  const navigation = useNavigation()

  useEffect(() => {
    if (navigation.state === 'submitting') {
      setIsDirty(false)
    }
  }, [navigation.state])

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!isDirty) return false
    if (currentLocation.pathname !== nextLocation.pathname) return true
    if (param == null) return false
    const of = (search: string) => new URLSearchParams(search).get(param)
    return of(currentLocation.search) !== of(nextLocation.search)
  })

  // Warn on tab close / browser back
  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges.current) e.preventDefault()
    }

    function handleSubmit() {
      hasUnsavedChanges.current = false
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    // Capture phase: a form that stops the event's propagation still counts as submitted.
    window.addEventListener('submit', handleSubmit, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('submit', handleSubmit, true)
    }
  }, [isDirty])

  const markDirty = useCallback(() => {
    hasUnsavedChanges.current = true
    setIsDirty(true)
  }, [])

  // For forms that count their changes: back to zero once every edit is undone.
  const setDirty = useCallback((dirty: boolean) => {
    hasUnsavedChanges.current = dirty
    setIsDirty(dirty)
  }, [])

  return { blocker, markDirty, setDirty }
}
