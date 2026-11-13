import { Avatar, SegmentedControl, SidePanel } from '@unitae/ui'
import { useState } from 'react'
import type { DocumentReader } from '~/features/display-board/server/board-audience.queries'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { formatPersonName } from '~/shared/utils/format-person-name'

/** From this width the panel docks beside the list, as every row-opened panel does. */
const DOCKED = '(min-width: 1280px)'

export interface DocumentReads {
  title: string
  sectionName: string
  read: DocumentReader[]
  unread: DocumentReader[]
}

type Tab = 'unread' | 'read'

function nameOf(reader: DocumentReader): string {
  return reader.anonymized ? m.board_read_status_anonymized_user() : formatPersonName(reader)
}

/** The readers by preaching group, groups in alphabetical order and those without one last. */
function byGroup(readers: DocumentReader[]): [string, DocumentReader[]][] {
  const groups = new Map<string, DocumentReader[]>()
  for (const reader of readers) {
    const key = reader.groupName ?? ''
    groups.set(key, [...(groups.get(key) ?? []), reader])
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b, getLocale())
  })
}

/**
 * Who among the people who can see a document has read it, beside the list. « Pas encore lu »
 * first, since that is who a reminder would go to; an earlier read is said as such.
 */
export function ReadsPanel({ reads, onClose }: { reads: DocumentReads; onClose: () => void }) {
  const docked = useMediaQuery(DOCKED) === true
  const [tab, setTab] = useState<Tab>(reads.unread.length > 0 ? 'unread' : 'read')
  const audience = reads.read.length + reads.unread.length
  const shown = tab === 'unread' ? reads.unread : reads.read

  const body = (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {m.board_reads_description({ read: reads.read.length, audience, section: reads.sectionName })}
      </p>
      <SegmentedControl
        aria-label={m.board_reads_tabs()}
        size="sm"
        value={tab}
        onValueChange={setTab}
        options={[
          { value: 'unread', label: m.board_reads_unread_tab({ count: reads.unread.length }) },
          { value: 'read', label: m.board_reads_read_tab({ count: reads.read.length }) },
        ]}
      />
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {tab === 'unread' ? m.board_reads_everyone_read() : m.board_reads_nobody_read()}
        </p>
      ) : (
        byGroup(shown).map(([group, readers]) => (
          <section key={group} className="flex flex-col gap-0.5">
            <h3 className="pb-1 font-medium text-faint text-xs">{group || m.board_reads_no_group()}</h3>
            <ul className="flex flex-col">
              {readers.map(reader => (
                <li key={reader.accountId} className="flex min-h-8 items-center gap-2 text-sm">
                  <Avatar name={nameOf(reader)} />
                  <span className="min-w-0 truncate">{nameOf(reader)}</span>
                  {reader.outdated && (
                    <span className="ml-auto shrink-0 text-faint text-xs">{m.board_reads_outdated()}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )

  // Below the docked width, the shared sheet: a bottom sheet on a phone.
  if (!docked) {
    return (
      <Sheet open onOpenChange={open => !open && onClose()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{m.board_reads_title()}</SheetTitle>
            <SheetDescription>{reads.title}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <SidePanel
      title={m.board_reads_title()}
      description={reads.title}
      onClose={onClose}
      closeLabel={m.board_reads_close()}
    >
      {body}
    </SidePanel>
  )
}
