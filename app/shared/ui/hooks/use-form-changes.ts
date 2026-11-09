import { useEffect, useState } from 'react'
import { countChangedFields } from '~/shared/utils/form-changes'

type CountChanges = (before: FormData, after: FormData) => number

const EVENTS = ['input', 'change'] as const
const INTERACTIONS = ['pointerdown', 'keydown'] as const
const REACT_REWRITES = new Set(['name', 'type'])

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
    let initial = new FormData(form)
    // Until the person edits a field, presses a key or a pointer, whatever React or a library still writes into the
    // form — a select's hidden native field filling in after mount — is part of what the form showed: the starting
    // point follows it instead of counting it as a change.
    let interacted = false
    setChanges(0)

    // Typing fires input events. Everything else React or Radix writes into the form — hidden inputs, entries
    // added or removed, a checkbox's state, a choice made in a menu portaled outside the form — shows up as a
    // DOM mutation. Counted on the next task, once those writes have settled.
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (interacted) setChanges(count(initial, new FormData(form)))
        else initial = new FormData(form)
      }, 0)
    }
    const interact = () => {
      interacted = true
    }
    // An input or change event on a field is the person's doing (a key, a paste, autofill), never a render.
    const onEdit = () => {
      interact()
      later()
    }
    for (const type of EVENTS) form.addEventListener(type, onEdit)
    for (const type of INTERACTIONS) document.addEventListener(type, interact, true)
    // React rewrites an input's `name` and `type` each time it updates the input's props: it clears the name for a
    // moment so radio groups stay consistent. Never the person's doing, and counting them looped: every render
    // rewrote them, which recounted, which rendered again — and the router's transition carrying an action's answer
    // or the reload after a save waited behind that stream until the next keypress.
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type !== 'attributes' || !REACT_REWRITES.has(record.attributeName ?? '')))
        later()
    })
    observer.observe(form, { subtree: true, childList: true, attributes: true, characterData: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      for (const type of EVENTS) form.removeEventListener(type, onEdit)
      for (const type of INTERACTIONS) document.removeEventListener(type, interact, true)
    }
  }, [form, count])

  return { ref: setForm, changes }
}
