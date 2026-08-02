import * as m from '~/i18n/paraglide/messages'

export type EmergencyContactView = {
  id: number
  name: string
  relationship: string
  phone: string
}

export type EmergencyInfoViewData = {
  dpaCardUpToDate: boolean
  survivalBackpackReady: boolean
  emergencyContacts: EmergencyContactView[]
}

// Shared by the publisher detail card and the emergency page's viewer mode.
export default function EmergencyInfoView({ info }: { info: EmergencyInfoViewData }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="text-muted-foreground text-sm">
          {m.publishers_emergency_dpa_label()} :{' '}
          <span className="font-medium text-foreground">{info.dpaCardUpToDate ? m.common_yes() : m.common_no()}</span>
        </p>
        <p className="text-muted-foreground text-sm">
          {m.publishers_emergency_backpack_label()} :{' '}
          <span className="font-medium text-foreground">
            {info.survivalBackpackReady ? m.common_yes() : m.common_no()}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">{m.publishers_emergency_contacts_title()}</p>
        {info.emergencyContacts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {info.emergencyContacts.map(contact => (
              <li key={contact.id} className="text-muted-foreground text-sm">
                <span className="font-medium text-foreground">{contact.name}</span>
                {contact.relationship ? ` — ${contact.relationship}` : ''}
                {contact.phone ? (
                  <>
                    {' — '}
                    <a href={`tel:${contact.phone}`} className="text-primary hover:underline">
                      {contact.phone}
                    </a>
                  </>
                ) : (
                  ''
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm italic">{m.publishers_emergency_no_contacts()}</p>
        )}
      </div>
    </div>
  )
}
