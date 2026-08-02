import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import * as m from '~/i18n/paraglide/messages'

export type EmergencyRosterPublisher = {
  id: number
  firstname: string
  lastname: string
  phone: string
  address: string
  email: string
  dpaCardUpToDate: boolean
  survivalBackpackReady: boolean
  publisherGroup: { name: string } | null
  emergencyContacts: { id: number; name: string; relationship: string; phone: string }[]
}

interface EmergencyRosterDocumentProps {
  title: string
  publishers: EmergencyRosterPublisher[]
}

function yesNo(value: boolean): string {
  return value ? m.common_yes() : m.common_no()
}

export function EmergencyRosterDocument({ title, publishers }: EmergencyRosterDocumentProps) {
  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <Text style={styles.title}>{m.publishers_emergency_title()}</Text>
        <Text style={styles.subtitle}>{title}</Text>

        {publishers.map(publisher => (
          <View key={publisher.id} style={styles.card} wrap={false}>
            <View style={styles.headerRow}>
              <Text style={styles.name}>
                {publisher.firstname} {publisher.lastname}
              </Text>
              {publisher.publisherGroup && <Text style={styles.group}>{publisher.publisherGroup.name}</Text>}
            </View>

            {publisher.address ? (
              <Text style={styles.line}>
                {m.publishers_view_postal_address()} : {publisher.address}
              </Text>
            ) : null}
            {publisher.phone ? (
              <Text style={styles.line}>
                {m.publishers_emergency_contact_phone()} : {publisher.phone}
              </Text>
            ) : null}
            {publisher.email ? (
              <Text style={styles.line}>
                {m.publishers_view_email_address()} : {publisher.email}
              </Text>
            ) : null}

            <Text style={styles.line}>
              {m.publishers_emergency_dpa_label()} : {yesNo(publisher.dpaCardUpToDate)}
              {'    '}
              {m.publishers_emergency_backpack_label()} : {yesNo(publisher.survivalBackpackReady)}
            </Text>

            <Text style={styles.contactsLabel}>{m.publishers_emergency_contacts_title()}</Text>
            {publisher.emergencyContacts.length > 0 ? (
              publisher.emergencyContacts.map(contact => (
                <Text key={contact.id} style={styles.contact}>
                  • {contact.name}
                  {contact.relationship ? ` — ${contact.relationship}` : ''}
                  {contact.phone ? ` — ${contact.phone}` : ''}
                </Text>
              ))
            ) : (
              <Text style={styles.contactEmpty}>{m.publishers_emergency_no_contacts()}</Text>
            )}
          </View>
        ))}
      </Page>
    </Document>
  )
}

const styles = StyleSheet.create({
  page: { padding: 24, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center', marginBottom: 16, color: '#444444' },
  card: {
    borderWidth: 1,
    borderColor: '#cccccc',
    borderStyle: 'solid',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  group: { fontSize: 10, color: '#666666' },
  line: { fontSize: 10, marginBottom: 2 },
  contactsLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  contact: { fontSize: 10, marginLeft: 6 },
  contactEmpty: { fontSize: 10, marginLeft: 6, color: '#888888', fontStyle: 'italic' },
})
