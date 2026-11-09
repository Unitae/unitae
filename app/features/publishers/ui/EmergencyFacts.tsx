import { StatusIcon } from '@unitae/ui'

import * as m from '~/i18n/paraglide/messages'

export interface EmergencyInfo {
  dpaCardUpToDate: boolean
  survivalBackpackReady: boolean
  emergencyContacts: { id: number; name: string; relationship: string; phone: string }[]
}

/** The emergency information as read: the two checks as a mark and words, then whom to call. */
export function EmergencyFacts({ info }: { info: EmergencyInfo }) {
  return (
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
                  <a href={`tel:${contact.phone}`} className="self-start text-brand-text tabular-nums hover:underline">
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
  )
}

/** A readiness check as a mark and words: a tick when ready, a half-filled warning when not. */
function Readiness({ ready, yes, no }: { ready: boolean; yes: string; no: string }) {
  return (
    <li className="flex items-center gap-2">
      <StatusIcon tone={ready ? 'success' : 'warning'} />
      {ready ? yes : no}
    </li>
  )
}
