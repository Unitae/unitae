// Preferences UI needs a stable data shape independent of the server-side
// registry (route loader can pass this to the client via loader data).

export interface NotificationCategoryView {
  key: string
  label: string
  /** Why this category reaches the reader, when not everyone gets it. */
  hint?: string
  types: NotificationTypeView[]
}

export interface NotificationTypeView {
  type: string
  label: string
  /** When it is sent, how often. */
  description?: string
  critical?: boolean
}
