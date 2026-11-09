import { FactList, Panel, StatusIcon } from '@unitae/ui'
import { Pencil } from 'lucide-react'
import { Link } from 'react-router'

import { formatCalendarDay } from '~/features/publishers/model/calendar-day'
import type { PublisherRecord } from '~/features/publishers/server/publisher-record.queries'
import type { EmergencyInfoViewData } from '~/features/publishers/ui/EmergencyInfoView'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'

interface RecordFactsProps {
  record: PublisherRecord
  /** Their age today, when the birth date is known. */
  age: number | null
  emergency: EmergencyInfoViewData | null
  rights: { canManageEmergency: boolean; canRecordVisit: boolean; canManageLogin: boolean }
}

/** The record's side column: what you look up about the person rather than follow over time. */
export function RecordFacts({ record, age, emergency, rights }: RecordFactsProps) {
  return (
    <>
      <ContactPanel record={record} />
      <CongregationPanel record={record} age={age} />
      <VisitPanel record={record} canRecord={rights.canRecordVisit} />
      {emergency && <EmergencyPanel publisherId={record.id} info={emergency} canManage={rights.canManageEmergency} />}
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

function VisitPanel({ record, canRecord }: { record: PublisherRecord; canRecord: boolean }) {
  return (
    <Panel
      title={m.publishers_visit_section_title()}
      padded
      actions={
        canRecord && (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/publishers/${record.id}/pastoral-visit`}>{m.publishers_visit_edit_link()}</Link>
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

function EmergencyPanel({
  publisherId,
  info,
  canManage,
}: {
  publisherId: number
  info: EmergencyInfoViewData
  canManage: boolean
}) {
  return (
    <Panel
      title={m.publishers_emergency_section_title()}
      padded
      actions={
        canManage && (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/publishers/${publisherId}/emergency`}>
              <Pencil />
              {m.publishers_emergency_edit_link()}
            </Link>
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <ul className="flex flex-col gap-2">
          <Readiness
            ready={info.dpaCardUpToDate}
            yes={m.publishers_emergency_dpa_label()}
            no={m.publishers_record_dpa_missing()}
          />
          <Readiness
            ready={info.survivalBackpackReady}
            yes={m.publishers_emergency_backpack_label()}
            no={m.publishers_record_backpack_missing()}
          />
        </ul>
        <div className="flex flex-col gap-2 border-border border-t pt-3">
          <span className="font-medium text-faint text-xs">{m.publishers_emergency_contacts_title()}</span>
          {info.emergencyContacts.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {info.emergencyContacts.map(contact => (
                <li key={contact.id} className="flex flex-col">
                  <span>
                    {contact.name}
                    {contact.relationship && <span className="text-faint"> · {contact.relationship}</span>}
                  </span>
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="self-start text-brand-text tabular-nums hover:underline"
                    >
                      {contact.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-faint">{m.publishers_emergency_no_contacts()}</span>
          )}
        </div>
      </div>
    </Panel>
  )
}

/** A readiness check as a mark and words: green tick when ready, half-filled warning when not. */
function Readiness({ ready, yes, no }: { ready: boolean; yes: string; no: string }) {
  return (
    <li className="flex items-center gap-2">
      <StatusIcon tone={ready ? 'success' : 'warning'} />
      {ready ? yes : no}
    </li>
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
