import { Moon, Sun } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const isDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)
    const resolved = isDark ? 'dark' : 'light'
    setTheme(resolved)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }, [theme])

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label={m.theme_toggle_aria_label()}>
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
