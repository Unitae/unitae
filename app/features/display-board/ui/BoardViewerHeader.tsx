import * as m from '~/i18n/paraglide/messages'
import { PageTopbar } from '~/shared/ui/PageTopbar'

interface BoardViewerHeaderProps {
  sectionName: string
  title: string
  actions?: React.ReactNode
  /** Dated facts under the bar: when it was added, replaced or updated, until when it is shown. */
  facts: React.ReactNode[]
}

/** « 5 novembre », in the congregation's time zone. */
export function formatViewerDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone }).format(date)
}

/**
 * The top of a board document: the shell's top bar with its trail and actions, then its dated
 * facts. On a phone the title shows under the trail; from md up it is the trail's last step.
 */
export function BoardViewerHeader({ sectionName, title, actions, facts }: BoardViewerHeaderProps) {
  return (
    <>
      <PageTopbar
        className="mb-0 gap-2 border-b px-4 py-3 md:border-b-0 md:px-0 md:pb-0"
        trail={[{ label: m.board_page_title(), to: '/board' }, { label: sectionName }, { label: title }]}
        actions={actions}
      >
        <h1 className="font-semibold text-base leading-snug md:sr-only">{title}</h1>
      </PageTopbar>
      {facts.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-muted-foreground text-sm md:px-6">
          {facts.map((fact, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sequence of facts, never reordered
            <span key={index}>{fact}</span>
          ))}
        </p>
      )}
    </>
  )
}
