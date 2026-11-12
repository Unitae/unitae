import { useSyncExternalStore } from 'react'

// Whether the page is drawn dark right now: the `.dark` class the theme puts on <html> (see use-theme), whatever the
// device says — someone can force a theme. For what must repaint itself on a switch, such as a map's style.

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const isDark = () => document.documentElement.classList.contains('dark')

/** True while the page is dark. False on the server. */
export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false)
}
