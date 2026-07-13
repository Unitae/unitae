// Preferences UI needs a stable data shape independent of the server-side
// registry (route loader can pass this to the client via loader data).

export interface NotificationCategoryView {
  key: string
  label: string
  types: NotificationTypeView[]
}

export interface NotificationTypeView {
  type: string
  label: string
  critical?: boolean
}
