import { useEffect } from 'react'

/**
 * Focuses the first invalid form field when actionData contains validation errors.
 * Conform sets aria-invalid="true" on fields with errors.
 */
export function useFocusError(actionData: unknown) {
  useEffect(() => {
    if (actionData == null) return

    // Small delay to ensure the DOM has updated with error states
    const timeout = setTimeout(() => {
      const firstInvalid = document.querySelector<HTMLElement>('[aria-invalid="true"]')
      firstInvalid?.focus()
    }, 50)

    return () => clearTimeout(timeout)
  }, [actionData])
}
