import { Kbd } from '@unitae/ui'
import { Bell, Search, TrendingUp, User } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import type { AppSidebarPermissions } from '~/shared/ui/AppSidebar'
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { buildManagementSections, buildPersonalItems, buildTabBar, type NavItem } from '~/shared/ui/navigation-config'
import { SETTINGS_ENTRY_DISPLAY } from '~/shared/ui/settings-entries'

interface CommandItem {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  to: string
}

/**
 * Every page the reader may open, from the same catalogue as the sidebar and the « Plus » sheet, so an entry is
 * gated by the same right everywhere. Then what the sidebar keeps a level down: the pioneers, each part of Réglages
 * and the notification settings.
 */
function getNavigationItems(permissions: AppSidebarPermissions): CommandItem[] {
  const toItem = (item: NavItem): CommandItem => ({ id: item.id, label: item.label(), icon: item.icon, to: item.to })
  const [home, ...tabs] = buildTabBar(permissions)
  const personal = buildPersonalItems().filter(item => item.id !== 'profile')
  const sections = buildManagementSections(permissions).flatMap(section => section.items)
  const items: CommandItem[] = [home, ...personal, ...tabs.filter(tab => tab.id === 'board')].map(toItem)

  for (const item of sections) {
    // Réglages is listed part by part below.
    if (item.id === 'settings') continue
    items.push(toItem(item))
    if (item.id === 'activity') {
      items.push({ id: 'pioneers', label: m.pioneers_title(), icon: TrendingUp, to: '/publishers/activity/pioneers' })
    }
  }
  for (const link of permissions.settingsLinks) {
    if (link.key === 'subscription') continue
    const { label, icon } = SETTINGS_ENTRY_DISPLAY[link.key]
    items.push({ id: `settings-${link.key}`, label: label(), icon, to: link.href })
  }
  items.push({ id: 'profile', label: m.account_title(), icon: User, to: '/me/profile' })
  items.push({ id: 'notifications', label: m.sidebar_my_notifications(), icon: Bell, to: '/me/notifications' })
  // The board is both a tab and, for those who manage it, the first entry of its section.
  return items.filter((item, index) => items.findIndex(other => other.id === item.id) === index)
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
              <Kbd>↑↓</Kbd> {m.command_palette_hint_navigate()}
            </span>
            <span>
              <Kbd>↵</Kbd> {m.command_palette_hint_open()}
            </span>
            <span>
              <Kbd>esc</Kbd> {m.command_palette_hint_close()}
            </span>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
