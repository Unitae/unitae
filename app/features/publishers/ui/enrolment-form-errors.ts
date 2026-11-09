/** The form-wide errors of a Conform reply that came back from the enrolment action, if any. */
export function formErrorsOf(reply: unknown): string[] {
  const errors = (reply as { error?: Record<string, string[] | null> } | undefined)?.error
  return errors?.[''] ?? []
}
