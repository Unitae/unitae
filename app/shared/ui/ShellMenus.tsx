import { Avatar, initials } from '@unitae/ui'
import { ChevronsUpDown, LogOut, type LucideIcon, Monitor, Moon, PanelLeft, Sun, User } from 'lucide-react'
import { Link, useSubmit } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { type ThemeChoice, useTheme } from '~/shared/ui/hooks/use-theme'
import { useOptionalSidebar } from '~/shared/ui/sidebar'
import { cn } from '~/shared/utils/utils'

const THEMES: { value: ThemeChoice; label: () => string; icon: LucideIcon }[] = [
  { value: 'system', label: m.theme_system, icon: Monitor },
  { value: 'light', label: m.theme_light, icon: Sun },
  { value: 'dark', label: m.theme_dark, icon: Moon },
]

const TRIGGER =
  'flex h-8 w-full min-w-0 items-center gap-2 rounded-md text-left text-sm outline-hidden transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-hover'

/** The congregation's initials in an ink square: the workspace mark, Linear-style. */
export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm bg-foreground font-bold text-[10px] text-background',
        className,
      )}
    >
      {initials(name) || 'U'}
    </span>
  )
}

/**
 * The congregation's name at the top of the sidebar, opening what belongs to this
 * device rather than to a page: the theme, and collapsing the sidebar.
 */
export function WorkspaceMenu({
  name,
  collapsible = true,
  className,
}: {
  name: string
  /** Offer collapsing the sidebar: not from the phone header, where there is none. */
  collapsible?: boolean
  className?: string
}) {
  const [theme, setTheme] = useTheme()
  const sidebar = useOptionalSidebar()
  const canCollapse = collapsible && sidebar != null && !sidebar.isMobile

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(TRIGGER, 'px-1.5 font-semibold text-foreground', className)}>
        <Monogram name={name} />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="font-medium text-faint text-xs">{m.theme_label()}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={value => {
            const chosen = THEMES.find(option => option.value === value)
            if (chosen) setTheme(chosen.value)
          }}
        >
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="size-4 text-faint" aria-hidden="true" />
              {label()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {canCollapse && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={sidebar.toggleSidebar}>
              <PanelLeft className="size-4 text-faint" aria-hidden="true" />
              {m.shell_collapse_sidebar()}
              <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The signed-in person at the foot of the sidebar: their profile, and signing out. */
export function UserMenu({ name }: { name: string }) {
  const submit = useSubmit()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(TRIGGER, 'gap-2.5 px-2 font-medium text-muted-foreground hover:text-foreground')}
      >
        <Avatar name={name} />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-48">
        <DropdownMenuItem asChild>
          <Link to="/me/profile">
            <User className="size-4 text-faint" aria-hidden="true" />
            {m.sidebar_my_profile()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => submit(null, { method: 'post', action: '/logout' })}>
          <LogOut className="size-4 text-faint" aria-hidden="true" />
          {m.sidebar_logout()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
