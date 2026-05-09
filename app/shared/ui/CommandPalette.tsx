import {
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  FileText,
  FolderOpen,
  Home,
  LayoutGrid,
  MapPin,
  PieChart,
  Search,
  Shield,
  User,
  UserCog,
  UserRoundCog,
  Users,
  UsersRound,
} from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import type { AppSidebarPermissions } from '~/shared/ui/AppSidebar'
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'

interface CommandItem {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  to: string
}

function getNavigationItems(permissions: AppSidebarPermissions): CommandItem[] {
  const items: CommandItem[] = [
    { id: 'home', label: m.sidebar_home(), icon: Home, to: '/' },
    { id: 'my-territories', label: m.sidebar_my_territories(), icon: MapPin, to: '/me/territories' },
  ]

  if (permissions.canViewBoard) {
    items.push({ id: 'board', label: m.sidebar_board(), icon: LayoutGrid, to: '/board' })
  }
  if (permissions.canManageBoard) {
    items.push({ id: 'sections', label: m.sidebar_sections(), icon: FolderOpen, to: '/board/sections' })
  }
  if (permissions.canUploadDocument || permissions.canManageBoard) {
    items.push({ id: 'documents', label: m.sidebar_documents(), icon: FileText, to: '/board/documents' })
  }
  if (permissions.canViewPublishers) {
    items.push({ id: 'publishers', label: m.sidebar_publishers(), icon: Users, to: '/publishers' })
    items.push({ id: 'groups', label: m.sidebar_publisher_groups(), icon: UsersRound, to: '/groups' })
  }
  if (permissions.canViewPrograms) {
    items.push({ id: 'programs', label: m.sidebar_programs(), icon: CalendarDays, to: '/programs' })
    items.push({ id: 'absences', label: m.sidebar_absences(), icon: CalendarOff, to: '/programs/days-off' })
  }
  if (permissions.canViewExternalSpeakers) {
    items.push({
      id: 'external-speakers',
      label: m.sidebar_external_speakers(),
      icon: UserCog,
      to: '/programs/external-speakers',
    })
  }
  if (permissions.canViewTerritories) {
    items.push({
      id: 'attributions',
      label: m.sidebar_attributions(),
      icon: CalendarCheck,
      to: '/territories/attributions',
    })
    items.push({ id: 'territories', label: m.sidebar_territories(), icon: MapPin, to: '/territories' })
  }
  if (permissions.canViewProspection) {
    items.push({ id: 'prospection', label: m.sidebar_prospection(), icon: Building2, to: '/territories/buildings' })
  }
  if (permissions.canManageTerritories) {
    items.push({ id: 'stats', label: m.sidebar_statistics(), icon: PieChart, to: '/territories/stats' })
  }
  if (permissions.canManageUsers) {
    items.push({ id: 'users', label: m.sidebar_users(), icon: Users, to: '/settings/users' })
  }
  if (permissions.canViewRoles) {
    items.push({
      id: 'congregation-roles',
      label: m.sidebar_assembly_roles(),
      icon: Shield,
      to: '/congregation/roles',
    })
  }
  if (permissions.canManagePermissions) {
    items.push({
      id: 'settings-permissions',
      label: m.sidebar_settings_permissions(),
      icon: Shield,
      to: '/settings/permissions',
    })
  }
  if (permissions.canManageSettings) {
    items.push({
      id: 'settings-territories',
      label: m.sidebar_settings_territories(),
      icon: MapPin,
      to: '/settings/territories',
    })
    items.push({
      id: 'settings-congregation',
      label: m.sidebar_settings_assembly(),
      icon: Building2,
      to: '/settings/congregation',
    })
    items.push({ id: 'audit-log', label: m.sidebar_audit_log(), icon: ClipboardList, to: '/settings/audit-log' })
  }
  if (permissions.isPlatformAdmin) {
    items.push({ id: 'admin', label: m.sidebar_administration(), icon: UserRoundCog, to: '/platform-admin' })
  }

  items.push({ id: 'profile', label: m.sidebar_my_profile(), icon: User, to: '/me/profile' })
  items.push({ id: 'my-absences', label: m.sidebar_my_absences(), icon: CalendarOff, to: '/me/days-off' })
  items.push({
    id: 'notifications',
    label: m.sidebar_my_notifications(),
    icon: Bell,
    to: '/me/notifications',
  })

  return items
}

interface CommandPaletteProps {
  permissions: AppSidebarPermissions
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ permissions, open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allItems = useMemo(() => getNavigationItems(permissions), [permissions])

  const filtered = useMemo(() => {
    if (!query) return allItems
    const lower = query.toLowerCase()
    return allItems.filter(item => item.label.toLowerCase().includes(lower))
  }, [query, allItems])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  // Keep selected index in bounds — intentionally depending on length, not the array reference
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when list size changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered.length])

  const selectItem = useCallback(
    (item: CommandItem) => {
      onOpenChange(false)
      navigate(item.to)
    },
    [navigate, onOpenChange],
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
      scrollToSelected()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
      scrollToSelected()
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      selectItem(filtered[selectedIndex])
    }
  }

  function scrollToSelected() {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector('[data-selected="true"]')
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent
          showCloseButton={false}
          className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={m.command_palette_placeholder()}
              className="h-11 border-0 px-0 shadow-none focus-visible:ring-0"
              autoFocus
            />
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground text-sm">{m.command_palette_no_results()}</p>
            ) : (
              <>
                <p className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
                  {m.command_palette_navigation()}
                </p>
                {filtered.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-selected={index === selectedIndex}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent data-[selected=true]:bg-accent"
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 border-t px-3 py-2 text-muted-foreground text-xs">
            <span>
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>{' '}
              {m.command_palette_hint_navigate()}
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↵</kbd>{' '}
              {m.command_palette_hint_open()}
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">esc</kbd>{' '}
              {m.command_palette_hint_close()}
            </span>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
