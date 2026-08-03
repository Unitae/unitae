import type { ComponentType } from 'react'
import { Link } from 'react-router'

interface SettingsNavCardProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  href: string
  // External targets (e.g. the billing portal) render as a plain anchor rather than a client Link.
  external?: boolean
}

// The shared visual language for a settings navigation target: icon + title + description, the whole
// card being the link. Used by the settings hub (/settings) and each module page so they stay
// visually identical.
export function SettingsNavCard({ icon: Icon, title, description, href, external = false }: SettingsNavCardProps) {
  const inner = (
    <div className="flex h-full items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent">
      <Icon className="mt-0.5 size-5 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  )

  return external ? (
    <a href={href} className="block">
      {inner}
    </a>
  ) : (
    <Link to={href} className="block">
      {inner}
    </Link>
  )
}
