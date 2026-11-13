import { SidePanel, type SidePanelWalk } from '@unitae/ui'
import { type ReactNode, useRef } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { cn } from '~/shared/utils/utils'

/**
 * The external-speakers page's panel: beside the list from 1280 px (the design system's SidePanel), in a sheet below.
 * Same title, description, header actions, content and footer either way.
 */
export function DirectoryPanelFrame({
  docked,
  title,
  description,
  actions,
  footer,
  returnFocus,
  walk,
  onClose,
  children,
}: {
  docked: boolean
  /** ↑ ↓ and « 3 sur 12 » in the docked panel's header. */
  walk?: SidePanelWalk
  title: ReactNode
  description?: ReactNode
  /** The item's own actions (« Modifier », a « … » menu), in the header before the close button. */
  actions?: ReactNode
  /** A form's cancel and save. */
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
        actions={actions}
        footer={footer}
        walk={walk}
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
        {/* The right padding keeps the actions and the title clear of the sheet's close button. */}
        <SheetHeader className="border-border border-b pr-12 pointer-coarse:pr-16">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SheetTitle>{title}</SheetTitle>
              {description != null && (
                <SheetDescription asChild>
                  <div>{description}</div>
                </SheetDescription>
              )}
            </div>
            {actions != null && <div className="flex flex-none items-center gap-1">{actions}</div>}
          </div>
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
