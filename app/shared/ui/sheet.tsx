'use client'

import { XIcon } from 'lucide-react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import type * as React from 'react'
import { useRef } from 'react'

import * as m from '~/i18n/paraglide/messages'
import { useKeyboardOpen } from '~/shared/ui/hooks/use-keyboard-open'
import { cn } from '~/shared/utils/utils'

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in',
        className,
      )}
      {...props}
    />
  )
}

/** How far the handle has to be pulled down before letting go closes the sheet. */
const DISMISS_DISTANCE_PX = 96

/**
 * Pulling a bottom sheet's handle down moves the sheet with the finger; letting go past `DISMISS_DISTANCE_PX` closes
 * it, otherwise it springs back.
 */
function useDragToClose() {
  const sheet = useRef<HTMLDivElement | null>(null)
  const close = useRef<HTMLButtonElement>(null)
  const start = useRef<number | null>(null)

  const distance = (event: React.PointerEvent) => Math.max(0, event.clientY - (start.current ?? event.clientY))
  const release = () => {
    start.current = null
    if (sheet.current == null) return
    // Back on its own transition: it springs back into place.
    sheet.current.style.transition = ''
    sheet.current.style.transform = ''
  }

  return {
    sheet,
    close,
    handle: {
      onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
        start.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
        // The sheet follows the finger without its transition's delay.
        if (sheet.current) sheet.current.style.transition = 'none'
      },
      onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
        if (start.current == null || sheet.current == null) return
        sheet.current.style.transform = `translateY(${distance(event)}px)`
      },
      onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
        const pulled = distance(event)
        release()
        if (pulled > DISMISS_DISTANCE_PX) close.current?.click()
      },
      onPointerCancel: release,
    },
  }
}

/**
 * `panel` (the default) is a row-opened panel: a side sheet from the right from the tablet up, and on a phone a
 * bottom sheet with a handle, 88 % of the screen high and full height while the keyboard is open. `right` and `left`
 * stay side sheets at every width (the phone sidebar); `bottom` is a menu rising from the bottom edge.
 */
type SheetSide = 'panel' | 'top' | 'right' | 'bottom' | 'left'

function SheetContent({
  className,
  children,
  side = 'panel',
  showCloseButton = true,
  ref,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide
  showCloseButton?: boolean
}) {
  const drag = useDragToClose()
  const keyboard = useKeyboardOpen()
  const grabbable = side === 'panel' || side === 'bottom'
  const setRef = (node: HTMLDivElement | null) => {
    drag.sheet.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref != null) ref.current = node
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={setRef}
        data-slot="sheet-content"
        data-side={side}
        data-keyboard={keyboard ? 'open' : undefined}
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-card shadow-lg transition data-[state=closed]:animate-out data-[state=open]:animate-in duration-(--u-duration-slow) ease-standard',
          side === 'panel' && [
            // The widths keep the `sm:` prefix of the side sheets, so a caller's `sm:max-w-md` still replaces them.
            'inset-x-0 bottom-0 h-[88dvh] w-full rounded-t-3xl border-t pt-3 pb-[env(safe-area-inset-bottom)] sm:w-3/4 sm:max-w-sm',
            'max-md:data-[state=closed]:slide-out-to-bottom max-md:data-[state=open]:slide-in-from-bottom',
            'max-md:w-full! max-md:max-w-none! max-md:data-[keyboard=open]:h-dvh max-md:data-[keyboard=open]:rounded-none',
            'md:inset-y-0 md:right-0 md:left-auto md:h-full md:rounded-none md:border-t-0 md:border-l md:pt-0',
            'md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right',
          ],
          side === 'right' &&
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-full border-l pb-[env(safe-area-inset-bottom)] sm:w-3/4 sm:max-w-sm',
          side === 'left' &&
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-full border-r pb-[env(safe-area-inset-bottom)] sm:w-3/4 sm:max-w-sm',
          side === 'top' &&
            'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto rounded-t-3xl border-t pt-3',
          className,
        )}
        {...props}
      >
        {grabbable && (
          <div
            aria-hidden="true"
            className={cn(
              'absolute inset-x-0 top-0 flex h-6 touch-none justify-center pt-2',
              side === 'panel' && 'md:hidden',
              keyboard && 'hidden',
            )}
            {...drag.handle}
          >
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </div>
        )}
        {children}
        {/* Letting go of a pulled handle closes the sheet through this button. */}
        <SheetPrimitive.Close ref={drag.close} hidden tabIndex={-1} aria-hidden="true" />
        {showCloseButton && (
          <SheetPrimitive.Close
            className={cn(
              'absolute top-3 right-3 grid size-8 place-content-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none pointer-coarse:size-11',
              grabbable && 'max-md:top-4',
            )}
          >
            <XIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">{m.common_close()}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-semibold text-base text-foreground leading-snug', className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger }
