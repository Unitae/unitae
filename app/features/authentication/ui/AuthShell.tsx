import { Lockup } from '@unitae/ui'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Monogram } from '~/shared/ui/ShellMenus'

interface AuthShellProps {
  /** The congregation the page belongs to: its monogram and name above the title. Null where none exists yet. */
  congregation: string | null
  title: string
  /** A line above the title in place of the congregation's name, e.g. « Première installation ». */
  eyebrow?: string
  /** A quiet icon in place of the monogram, on a page that reports rather than asks: a link sent, a link expired. */
  icon?: LucideIcon
  /** What the page says under its title. */
  description?: React.ReactNode
  children?: React.ReactNode
}

/**
 * The frame of every page before the app: the bare page, one narrow column in the middle, no card. The column opens
 * with the congregation's monogram and name (the unitae mark where no congregation exists yet) and the page's action
 * as its title; the unitae mark and the privacy page close the page.
 */
export function AuthShell({ congregation, title, eyebrow, icon: Icon, description, children }: AuthShellProps) {
  const over = eyebrow ?? (Icon == null ? congregation : null)
  return (
    <div className="flex min-h-svh flex-col items-center bg-background px-4">
      <main className="flex w-full flex-1 items-center justify-center py-16">
        <div className="flex w-full max-w-[22.5rem] animate-fade-in-up flex-col gap-5">
          <div className="flex flex-col items-start gap-3.5">
            <Emblem congregation={congregation} icon={Icon} />
            <div className="flex flex-col gap-1">
              {over != null && <p className="text-faint text-sm">{over}</p>}
              <h1 className="font-semibold text-2xl leading-tight tracking-tight">{title}</h1>
            </div>
            {description != null && <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>}
          </div>
          {children}
        </div>
      </main>
      <footer className="flex items-center gap-4 py-6 text-faint text-xs">
        {/* The mark closes the page wherever it does not open it. */}
        {(congregation != null || Icon != null) && <Lockup size={13} className="opacity-60" />}
        <Link to="/privacy" className="transition-colors hover:text-foreground">
          {m.auth_shell_privacy()}
        </Link>
      </footer>
    </div>
  )
}

function Emblem({ congregation, icon: Icon }: { congregation: string | null; icon?: LucideIcon }) {
  if (Icon != null) {
    return (
      <span className="grid size-10 place-content-center rounded-md border border-border bg-sidebar">
        <Icon aria-hidden="true" className="size-5 text-faint" />
      </span>
    )
  }
  if (congregation == null) return <Lockup size={20} />
  return <Monogram name={congregation} className="size-10 rounded-md text-[15px]" />
}
