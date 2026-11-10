import { useCallback, useEffect, useState } from 'react'
import { useNavigation } from 'react-router'

import {
  type Draft,
  type DraftChange,
  EMPTY_DRAFT,
  withChange,
  withoutChange,
} from '~/features/territories/model/territory-draft'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'

/**
 * The editor's changes until « Enregistrer ». Leaving warns while there is one or while `otherChanges` holds (the
 * number, the notes); undoing them all ends the warning. A refused save comes back to the page with its changes
 * kept, so the warning comes back with them once the submission is over.
 */
export function useTerritoryDraft(otherChanges: boolean) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const { blocker, setDirty } = useUnsavedChanges()
  const idle = useNavigation().state === 'idle'
  const dirty = draft.size > 0 || otherChanges

  useEffect(() => {
    if (idle) setDirty(dirty)
  }, [dirty, idle, setDirty])

  const change = useCallback((next: DraftChange) => setDraft(prev => withChange(prev, next)), [])
  const undo = useCallback((entranceId: number) => setDraft(prev => withoutChange(prev, entranceId)), [])
  const reset = useCallback(() => setDraft(EMPTY_DRAFT), [])

  return { draft, blocker, change, undo, reset }
}
