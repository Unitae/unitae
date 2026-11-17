import { createContext, useContext, useMemo } from 'react'

const HelpAccessContext = createContext<ReadonlySet<string>>(new Set())

/**
 * The articles this reader may open, set once by the authenticated layout. Each « ? » entry point asks it, so a page
 * shows the entry only when the article it leads to is open to the reader.
 */
export function HelpAccessProvider({ slugs, children }: { slugs: readonly string[]; children: React.ReactNode }) {
  const value = useMemo(() => new Set(slugs), [slugs])
  return <HelpAccessContext.Provider value={value}>{children}</HelpAccessContext.Provider>
}

export function useCanOpenHelp(slug: string): boolean {
  return useContext(HelpAccessContext).has(slug)
}
