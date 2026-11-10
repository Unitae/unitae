import type { LucideIcon } from 'lucide-react'
import { CircleAlert, EyeOff, Search } from 'lucide-react'
import { isRouteErrorResponse } from 'react-router'

import * as m from '~/i18n/paraglide/messages'

export interface ErrorInfo {
  status: number
  icon: LucideIcon
  /** The line above the title: « Erreur 404 ». */
  code: string
  title: string
  /** Inside the app, where the page's section is a click away. */
  description: string
  /** Outside it, with only the way home. */
  outsideDescription: string
  /** The page's crumb in the app's top bar. */
  crumb: string
  /** Not the visitor's doing: worth retrying, worth reporting. */
  isServerError: boolean
}

/** What to say about whatever a route threw: a response's status, anything else as a server error. */
export function getErrorInfo(error: unknown): ErrorInfo {
  const status = isRouteErrorResponse(error) ? error.status : 500
  const code = m.error_code({ status })
  if (status === 404) {
    return {
      status,
      icon: Search,
      code,
      title: m.error_boundary_not_found(),
      description: m.error_boundary_not_found_description(),
      outsideDescription: m.error_boundary_not_found_outside(),
      crumb: m.error_crumb_not_found(),
      isServerError: false,
    }
  }
  if (status === 403) {
    return {
      status,
      icon: EyeOff,
      code,
      title: m.error_boundary_forbidden(),
      description: m.error_boundary_forbidden_description(),
      outsideDescription: m.error_boundary_forbidden_description(),
      crumb: m.error_crumb_forbidden(),
      isServerError: false,
    }
  }
  return {
    status,
    icon: CircleAlert,
    code,
    title: m.error_boundary_server_error(),
    description: m.error_boundary_server_error_description(),
    outsideDescription: m.error_boundary_server_error_outside(),
    crumb: m.error_crumb_error(),
    isServerError: true,
  }
}
