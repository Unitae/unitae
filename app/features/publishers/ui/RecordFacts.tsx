import { FactList, Panel } from '@unitae/ui'
import { Pencil } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { formatCalendarDay } from '~/features/publishers/model/calendar-day'
import type { PublisherRecord } from '~/features/publishers/server/publisher-record.queries'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

import { EmergencyFacts, type EmergencyInfo } from './EmergencyFacts'

interface RecordFactsProps {
  record: PublisherRecord
  /** Their age today, when the birth date is known. */
  age: number | null
  emergency: EmergencyInfo | null
  rights: { canManageEmergency: boolean; canRecordVisit: boolean; canManageLogin: boolean }
  /** The emergency panel is open beside the page: its block is marked. */
  emergencyOpen: boolean
  onOpenEmergency: (trigger: HTMLElement) => void
  onOpenVisit: () => void
}

/** The record's side column: what you look up about the person rather than follow over time. */
export function RecordFacts({
  record,
  age,
  emergency,
  rights,
  emergencyOpen,
  onOpenEmergency,
  onOpenVisit,
}: RecordFactsProps) {
  return (
    <>
      <ContactPanel record={record} />
      <CongregationPanel record={record} age={age} />
      <VisitPanel record={record} canRecord={rights.canRecordVisit} onOpen={onOpenVisit} />
      {emergency && (
        <EmergencyBlock
          info={emergency}
          canManage={rights.canManageEmergency}
          open={emergencyOpen}
          onOpen={onOpenEmergency}
        />
      )}
      {rights.canManageLogin && <LoginPanel login={record.login} />}
    </>
  )
}

function ContactPanel({ record }: { record: PublisherRecord }) {
  return (
    <Panel title={m.publishers_record_contact()} padded>
      <FactList
        emptyLabel={m.publishers_record_not_set()}
        facts={[
          {
            label: m.publishers_view_phone(),
            value: record.phone && (
              <a href={`tel:${record.phone}`} className="text-brand-text tabular-nums hover:underline">
                {record.phone}
              </a>
            ),
          },
          {
            label: m.publishers_record_email(),
            value: record.email && (
              <a href={`mailto:${record.email}`} className="text-brand-text hover:underline">
                {record.email}
              </a>
            ),
          },
          { label: m.publishers_record_address(), value: record.address },
        ]}
      />
    </Panel>
  )
}

function nomination(record: PublisherRecord) {
  if (record.isHelder) return m.publishers_record_elder()
  if (record.isServant) return m.publishers_record_servant()
  return null
}

function CongregationPanel({ record, age }: { record: PublisherRecord; age: number | null }) {
  const locale = getLocale()
  const day = (date: Date | null) => date && formatCalendarDay(date, locale)
  return (
    <Panel title={m.publishers_record_congregation()} padded>
      <FactList
        facts={[
          {
            label: m.publishers_record_group(),
            value: record.group ? formatGroupName(record.group.name) : m.publishers_record_no_group(),
            hint:
              record.group && m.publishers_record_group_leader({ name: formatPersonName(record.group.responsible) }),
          },
          { label: m.publishers_record_nomination(), value: nomination(record) },
          { label: m.publishers_record_baptism(), value: day(record.baptismDate) },
          {
            label: m.publishers_record_birth(),
            value: day(record.birthDate),
            hint: age != null ? m.publishers_record_age({ count: age }) : undefined,
          },
          { label: m.publishers_record_arrival(), value: day(record.arrivedAt) },
        ]}
      />
    </Panel>
  )
}

function VisitPanel({
  record,
  canRecord,
  onOpen,
}: {
  record: PublisherRecord
  canRecord: boolean
  onOpen: () => void
}) {
  return (
    <Panel
      title={m.publishers_visit_section_title()}
      padded
      actions={
        canRecord && (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            {m.publishers_visit_edit_link()}
          </Button>
        )
      }
    >
      <FactList
        emptyLabel={m.publishers_visit_none()}
        facts={[
          {
            label: m.publishers_record_last_visit(),
            value: record.lastPastoralVisitAt && formatCalendarDay(record.lastPastoralVisitAt, getLocale()),
          },
        ]}
      />
    </Panel>
  )
}

interface EmergencyBlockProps {
  info: EmergencyInfo
  canManage: boolean
  open: boolean
  onOpen: (trigger: HTMLElement) => void
}

function EmergencyBlock({ info, canManage, open, onOpen }: EmergencyBlockProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Opening its panel reflows the page into one column: the block being edited is brought back into view.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [open])
  return (
    <div ref={ref} className="scroll-mt-4">
      <Panel
        title={m.publishers_emergency_section_title()}
        padded
        className={cn(open && 'ring-2 ring-ring')}
        actions={
          canManage && (
            <Button variant="ghost" size="sm" onClick={event => onOpen(event.currentTarget)}>
              <Pencil />
              {m.publishers_emergency_edit_link()}
            </Button>
          )
        }
      >
        <EmergencyFacts info={info} />
      </Panel>
    </div>
  )
}

function LoginPanel({ login }: { login: PublisherRecord['login'] }) {
  return (
    <Panel title={m.publishers_record_login()} padded>
      <FactList
        emptyLabel={m.publishers_record_login_none()}
        facts={[
          {
            label: m.publishers_record_login_id(),
            value: login?.email,
            hint: login ? m.publishers_record_login_can_sign_in() : undefined,
          },
        ]}
      />
    </Panel>
  )
}
