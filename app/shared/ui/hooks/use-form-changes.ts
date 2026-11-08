import { useEffect, useState } from 'react'
import { countChangedFields } from '~/shared/utils/form-changes'

type CountChanges = (before: FormData, after: FormData) => number

const EVENTS = ['input', 'change'] as const

/**
 * How many changes a form holds against what it showed when it mounted, kept current as the person edits. Pass
 * the returned `ref` to the form; remount the form (a new `key`) to take a new starting point, e.g. after
 * « Annuler ». `count` must be a stable function: module level, not an inline closure.
 */
export function useFormChanges(count: CountChanges = countChangedFields) {
  const [form, setForm] = useState<HTMLFormElement | null>(null)
  const [changes, setChanges] = useState(0)

  useEffect(() => {
    if (form == null) return
    const initial = new FormData(form)
    setChanges(0)

    // Typing fires input events. Everything else React or Radix writes into the form — hidden inputs, entries
    // added or removed, a checkbox's state, a choice made in a menu portaled outside the form — shows up as a
    // DOM mutation. Counted on the next task, once those writes have settled.
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setChanges(count(initial, new FormData(form))), 0)
    }
    for (const type of EVENTS) form.addEventListener(type, later)
    const observer = new MutationObserver(later)
    observer.observe(form, { subtree: true, childList: true, attributes: true, characterData: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      for (const type of EVENTS) form.removeEventListener(type, later)
    }
  }, [form, count])

  return { ref: setForm, changes }
}
