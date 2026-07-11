import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  createContext: vi.fn(() => null),
  useContext: vi.fn(() => null),
}))

const { useSidebar } = await import('./sidebar-context')

describe('useSidebar', () => {
  it('throws when used outside SidebarProvider', () => {
    expect(() => useSidebar()).toThrow('must be used within a SidebarProvider')
  })
})
