import { Download, Mic, Send, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import type { OurBrother, OurSpeakerListPage } from '~/features/events/model/our-speaker.type'
import { formatSpeakerDate } from '~/features/events/model/speaker-dates'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatEventDate } from '~/shared/utils/event-time'
import { OurBrotherPanel } from './OurBrotherPanel'
import { OurListHeaderCard, OurListSendsCard } from './OurListCards'
import { MarkOurListSentDialog, OUR_LIST_PDF, SendOurListDialog } from './OurListDialogs'
import { type OurListView, OurSpeakerTable } from './OurSpeakerTable'
import { SpeakerListsTabs } from './SpeakerListsTabs'

// « Notre liste »: the brothers we send to the other congregations. The list beside, from 1280 px, who is printed at
// its head and where it went — or, once a brother is opened, his panel. Below 1280 px those cards follow the list and
// the brother opens in a sheet. The open brother and the view live in the address.

const DOCKED = '(min-width: 1280px)'
const SETTINGS = '/settings/external-speakers'
const ORGANIGRAM = '/congregation/roles/organigram'

export interface OurSpeakerListData {
  page: OurSpeakerListPage
  receivedCount: number
  /** How many brothers the candidates' role holds; a reader's page only carries those on the list. */
  candidateCount: number
  congregationName: string
  emailFrom: string
  emailEnabled: boolean
  /** The attachment's name, as the e-mail carries it. */
  pdfFilename: string
  signature: string
  /** The congregation's today, « 2026-11-11 ». */
  today: string
  timezone: string
  canManage: boolean
  canConfigure: boolean
  canViewPublishers: boolean
}

type Dialog = { kind: 'send' | 'mark'; ids: number[] } | null

/** The page's two actions: the PDF, for anyone who sees the list, and sending it, for whoever manages it. */
function OurListActions({
  canSend,
  onDownload,
  onSend,
}: {
  canSend: boolean
  onDownload: () => void
  onSend: () => void
}) {
  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href={OUR_LIST_PDF} onClick={onDownload}>
          <Download aria-hidden="true" />
          <span className="max-sm:sr-only">{m.external_speakers_ours_download()}</span>
        </a>
      </Button>
      {canSend && (
        <Button size="sm" onClick={onSend}>
          <Send aria-hidden="true" />
          {m.external_speakers_ours_send()}
        </Button>
      )}
    </>
  )
}

const EMPTY = 'border-border text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm'

/** The list itself: who the candidates are, the two views, the brothers, and why only some go out. */
function OurListMain({
  page,
  candidateCount,
  role,
  view,
  timezone,
  canConfigure,
  selectedId,
  onView,
  onOpen,
}: {
  page: OurSpeakerListPage
  candidateCount: number
  role: { key: string; name: string }
  /** Only someone who manages the list sees the candidates left off it. */
  view: OurListView | null
  timezone: string
  canConfigure: boolean
  selectedId: number | null
  onView: (view: OurListView) => void
  onOpen: (brother: OurBrother, trigger: HTMLElement) => void
}) {
  const onList = page.brothers.filter(each => each.onList)
  const candidates = (
    <p className="text-muted-foreground flex items-start gap-2 text-sm">
      <Users aria-hidden="true" className="text-faint mt-0.5 size-4 shrink-0" />
      <span className="flex-1">
        {m.external_speakers_ours_candidates_count({
          count: String(candidateCount),
          role: role.name,
          on: String(onList.length),
        })}
      </span>
      {canConfigure && (
        <Link to={SETTINGS} className="text-primary shrink-0 hover:underline max-sm:hidden">
          {m.external_speakers_ours_change_role()}
        </Link>
      )}
    </p>
  )
  if (candidateCount === 0) {
    return (
      <>
        {candidates}
        <p className={EMPTY}>
          {m.external_speakers_ours_no_candidates({ role: role.name })}{' '}
          <Link to={ORGANIGRAM} className="text-primary hover:underline">
            {m.settings_external_speakers_open_organigram()}
          </Link>
        </p>
      </>
    )
  }
  return (
    <>
      {candidates}
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        {view != null && (
          <QuickViews
            label={m.external_speakers_ours_views_label()}
            value={view}
            onChoose={onView}
            views={[
              { value: 'on', label: m.external_speakers_ours_view_on(), count: onList.length },
              { value: 'all', label: m.external_speakers_ours_view_all(), count: candidateCount },
            ]}
          />
        )}
        <span className="flex-1" />
        {page.changedAt && (
          <span className="text-faint text-sm">
            {m.external_speakers_ours_modified_on({ date: formatSpeakerDate(page.changedAt, timezone) })}
          </span>
        )}
      </div>
      {view !== 'all' && onList.length === 0 ? (
        <p className={EMPTY}>{m.external_speakers_ours_empty_on()}</p>
      ) : (
        <OurSpeakerTable
          brothers={view === 'all' ? page.brothers : onList}
          view={view ?? 'on'}
          selectedId={selectedId}
          onOpen={onOpen}
        />
      )}
      <p className="text-faint max-w-3xl text-sm">{m.external_speakers_ours_why()}</p>
    </>
  )
}

export function OurSpeakerListScreen({ data }: { data: OurSpeakerListData }) {
  const { page, canManage, canConfigure, timezone, congregationName } = data
  const [params, setParams] = useSearchParams()
  const docked = useMediaQuery(DOCKED) === true
  const trigger = useRef<HTMLElement | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<{ next: number | null } | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const view: OurListView = params.get('view') === 'all' ? 'all' : 'on'
  const brotherId = Number(params.get('brother')) || null
  const brother = brotherId == null ? null : (page.brothers.find(each => each.memberId === brotherId) ?? null)
  const onList = page.brothers.filter(each => each.onList)
  const outdated = page.recipients.filter(each => each.outdated).map(each => each.speakerCongregationId)

  const open = useCallback(
    (memberId: number | null, replace = false) =>
      setParams(
        previous => {
          if (memberId == null) previous.delete('brother')
          else previous.set('brother', String(memberId))
          return previous
        },
        { preventScrollReset: true, replace },
      ),
    [setParams],
  )
  const select = (memberId: number | null) => (dirty ? setPending({ next: memberId }) : open(memberId))
  // A brother no longer a candidate (or another congregation's link): the address stops naming him.
  const missing = brotherId != null && brother == null
  useEffect(() => {
    if (missing) open(null, true)
  }, [missing, open])

  const setView = (next: OurListView) =>
    setParams(
      previous => {
        if (next === 'on') previous.delete('view')
        else previous.set('view', next)
        return previous
      },
      { replace: true, preventScrollReset: true },
    )

  // After a download, the person who manages the list is offered to record that it went out by their own mailbox.
  const downloaded = () => {
    if (!canManage) return
    toast(m.external_speakers_downloaded(), {
      action: {
        label: m.external_speakers_downloaded_mark(),
        onClick: () => setDialog({ kind: 'mark', ids: outdated }),
      },
    })
  }
  const month = formatEventDate(new Date(), timezone, getLocale(), { month: 'long', year: 'numeric' })

  const panel = brother ? (
    <OurBrotherPanel
      key={brother.memberId}
      brother={brother}
      canManage={canManage}
      canViewPublishers={data.canViewPublishers}
      docked={docked}
      returnFocus={trigger.current}
      onClose={() => select(null)}
      onDirtyChange={setDirty}
    />
  ) : null
  const cards = (
    <>
      <OurListHeaderCard page={page} canConfigure={canConfigure} />
      <OurListSendsCard
        recipients={page.recipients}
        timezone={timezone}
        canManage={canManage}
        onMarkSent={() => setDialog({ kind: 'mark', ids: outdated })}
        onSendOutdated={() => setDialog({ kind: 'send', ids: outdated })}
      />
    </>
  )
  const role = page.candidatesRole

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked panel can stick.
    <div data-sticky-content="" className="flex flex-col gap-5">
      <PageTopbar
        trail={[{ label: m.external_speakers_page_title() }]}
        className="mb-0"
        actions={
          onList.length > 0 && (
            <OurListActions
              canSend={canManage && page.recipients.length > 0}
              onDownload={downloaded}
              onSend={() => setDialog({ kind: 'send', ids: outdated })}
            />
          )
        }
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">{m.external_speakers_page_title()}</h1>
          <span className="text-faint tabular-nums">
            {onList.length === 1
              ? m.external_speakers_ours_count_one()
              : m.external_speakers_ours_count_many({ count: String(onList.length) })}
          </span>
        </div>
      </PageTopbar>
      <SpeakerListsTabs received={data.receivedCount} ours={onList.length} />

      {role == null ? (
        <EmptyState
          icon={Mic}
          title={m.external_speakers_ours_no_role_title()}
          description={canConfigure ? m.external_speakers_ours_no_role() : m.external_speakers_ours_no_role_reader()}
          action={
            canConfigure ? (
              <Button size="sm" asChild>
                <Link to={SETTINGS}>{m.external_speakers_ours_open_settings()}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex items-start gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <OurListMain
              page={page}
              candidateCount={data.candidateCount}
              role={role}
              view={canManage ? view : null}
              timezone={timezone}
              canConfigure={canConfigure}
              selectedId={brother?.memberId ?? null}
              onView={setView}
              onOpen={(next, element) => {
                trigger.current = element
                select(next.memberId === brother?.memberId ? null : next.memberId)
              }}
            />
            {!docked && <div className="mt-2 grid items-start gap-4 md:grid-cols-2">{cards}</div>}
          </div>
          {docked && (panel ?? <div className="sticky top-4 flex w-[360px] shrink-0 flex-col gap-4">{cards}</div>)}
        </div>
      )}
      {!docked && panel}

      {dialog?.kind === 'send' && (
        <SendOurListDialog
          recipients={page.recipients}
          preselected={dialog.ids}
          responsible={page.header.responsible}
          emailFrom={data.emailFrom}
          emailEnabled={data.emailEnabled}
          subject={m.external_speakers_send_subject_default({ name: congregationName, month })}
          message={m.external_speakers_send_message_default({ name: congregationName, signature: data.signature })}
          filename={data.pdfFilename}
          count={onList.length}
          timezone={timezone}
          onOpenChange={next => !next && setDialog(null)}
          onMarkInstead={ids => setDialog({ kind: 'mark', ids })}
        />
      )}
      {dialog?.kind === 'mark' && (
        <MarkOurListSentDialog
          recipients={page.recipients}
          preselected={dialog.ids}
          today={data.today}
          timezone={timezone}
          onOpenChange={next => !next && setDialog(null)}
        />
      )}
      <DiscardChangesDialog
        open={pending != null}
        onStay={() => setPending(null)}
        onDiscard={() => {
          open(pending?.next ?? null)
          setPending(null)
          setDirty(false)
        }}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    </div>
  )
}
