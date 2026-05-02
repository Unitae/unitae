import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, SearchX, ShieldX } from 'lucide-react'

import * as m from '~/i18n/paraglide/messages'

export interface ErrorInfo {
  icon: LucideIcon
  title: string
  description: string
  showRetry: boolean
  showReport: boolean
}

export function getErrorInfo(status: number): ErrorInfo {
  if (status === 404) {
    return {
      icon: SearchX,
      title: m.error_boundary_not_found(),
      description: m.error_boundary_not_found_description(),
      showRetry: false,
      showReport: false,
    }
  }
  if (status === 403) {
    return {
      icon: ShieldX,
      title: m.error_boundary_forbidden(),
      description: m.error_boundary_forbidden_description(),
      showRetry: false,
      showReport: false,
    }
  }
  return {
    icon: AlertTriangle,
    title: m.error_boundary_server_error(),
    description: m.error_boundary_server_error_description(),
    showRetry: true,
    showReport: true,
  }
}
