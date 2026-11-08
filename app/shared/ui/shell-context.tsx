import { createContext, useContext } from 'react'

interface Shell {
  /** Opens the command palette. */
  openSearch: () => void
}

const ShellContext = createContext<Shell | null>(null)

export const ShellProvider = ShellContext.Provider

/** What the app shell lets a page's chrome do, or null when rendered outside it. */
export function useShell(): Shell | null {
  return useContext(ShellContext)
}
