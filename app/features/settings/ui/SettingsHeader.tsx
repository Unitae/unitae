import type { ReactNode } from 'react'
import * as m from '~/i18n/paraglide/messages'
import type { BreadcrumbEntry } from '~/shared/ui/PageBreadcrumb'
import { PageHeader } from '~/shared/ui/PageHeader'

interface SettingsHeaderProps {
  title: string
  subtitle?: string
  /** The crumbs between Réglages and the page, e.g. the templates list before a template. */
  trail?: BreadcrumbEntry[]
  actions?: ReactNode
  titleBadge?: ReactNode
}

/** A part of Réglages: its trail from Réglages (the way back to the list on a phone), its title and its actions. */
export function SettingsHeader({ title, subtitle, trail = [], actions, titleBadge }: SettingsHeaderProps) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      titleBadge={titleBadge}
      actions={actions}
      breadcrumbs={[{ label: m.settings_title(), to: '/settings' }, ...trail, { label: title }]}
    />
  )
}
