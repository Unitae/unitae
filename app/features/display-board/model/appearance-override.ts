const FIELDS = ['typeface', 'accent', 'layout'] as const

/**
 * The appearance a form shows but has not saved, read from a preview's address: `?typeface=&accent=&layout=`.
 * Null when the address carries none, so the saved appearance applies. Values pass through as given:
 * `parseAppearance` keeps only those the document offers.
 */
export function readAppearanceOverride(params: URLSearchParams): Record<string, string> | null {
  const override = Object.fromEntries(
    FIELDS.flatMap(field => {
      const value = params.get(field)
      return value ? [[field, value]] : []
    }),
  )
  return Object.keys(override).length > 0 ? override : null
}
