import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

// The boot script in root.tsx reads the same key before first paint: no key means « Système ».
const STORAGE_KEY = 'theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const listeners = new Set<() => void>()

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function applyThemeChoice(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia(DARK_QUERY).matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function writeThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  applyThemeChoice(choice)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // While on « Système », follow the device when it switches.
  const query = window.matchMedia(DARK_QUERY)
  const followDevice = () => {
    if (readThemeChoice() === 'system') applyThemeChoice('system')
  }
  query.addEventListener('change', followDevice)
  return () => {
    listeners.delete(listener)
    query.removeEventListener('change', followDevice)
  }
}

/** The theme the person chose, shared by every menu that offers it. « Système » on the server. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, readThemeChoice, () => 'system' as const)
  return [choice, writeThemeChoice]
}
