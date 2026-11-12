import { useEffect, useState } from 'react'

/** How much of the window the on-screen keyboard covers, at least, before a sheet treats it as open. */
const KEYBOARD_MIN_PX = 150

/**
 * Whether the visible part of the page is short enough that a keyboard covers the rest. Zooming in also shrinks the
 * visual viewport, so its height is scaled back first: pinching is not typing.
 */
export function keyboardCovers(windowHeight: number, viewport: { height: number; scale: number }): boolean {
  return windowHeight - viewport.height * viewport.scale > KEYBOARD_MIN_PX
}

/** Whether the on-screen keyboard is open, from the visual viewport. Always `false` where there is none. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (viewport == null) return
    const update = () => setOpen(keyboardCovers(window.innerHeight, viewport))
    update()
    viewport.addEventListener('resize', update)
    return () => viewport.removeEventListener('resize', update)
  }, [])

  return open
}
