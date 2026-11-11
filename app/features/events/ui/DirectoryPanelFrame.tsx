import { SidePanel } from '@unitae/ui'
import { type ReactNode, useRef } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { cn } from '~/shared/utils/utils'

/**
 * The external-speakers page's panel: beside the list from 1280 px (the design system's SidePanel), in a sheet below.
 * Same title, description, content and footer either way.
 */
export function DirectoryPanelFrame({
  docked,
  title,
  description,
  footer,
  returnFocus,
  onClose,
  children,
}: {
  docked: boolean
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  returnFocus?: HTMLElement | null
  onClose: () => void
  children: ReactNode
}) {
  const sheet = useRef<HTMLDivElement>(null)
  if (docked) {
    return (
      <SidePanel
        title={title}
        description={description}
        closeLabel={m.external_speakers_close()}
        onClose={onClose}
        returnFocus={returnFocus}
        footer={footer}
      >
        {children}
      </SidePanel>
    )
  }
  return (
    <Sheet open onOpenChange={next => !next && onClose()}>
      <SheetContent
        ref={sheet}
        className="gap-0 outline-none sm:max-w-md"
        // The sheet itself takes focus, not its first link: nothing lights up as it opens, and Tab starts at the top.
        onOpenAutoFocus={event => {
          event.preventDefault()
          sheet.current?.focus()
        }}
      >
        <SheetHeader className="border-border border-b">
          <SheetTitle>{title}</SheetTitle>
          {description != null && (
            <SheetDescription asChild>
              <div>{description}</div>
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <SheetFooter className="border-border flex-row justify-end border-t">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}

/** A section of a panel, divided from the next by a rule. */
export function PanelSection({
  title,
  aside,
  className,
  children,
}: {
  title?: ReactNode
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0', className)}>
      {title != null && (
        <h3 className="flex items-baseline gap-2 text-sm font-semibold">
          {title}
          {aside != null && <span className="text-faint font-normal tabular-nums">{aside}</span>}
        </h3>
      )}
      {children}
    </section>
  )
}
