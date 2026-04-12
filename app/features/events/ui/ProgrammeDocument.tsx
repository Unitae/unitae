import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

const SECTION_COLOR_RULES: [string, string][] = [
  ['joyaux', '#5B6770'],
  ['minist', '#C18626'],
  ['chr', '#942926'],
]

function sectionColor(section: string): string | null {
  const lower = section.toLowerCase()
  for (const [pattern, color] of SECTION_COLOR_RULES) {
    if (lower.includes(pattern)) return color
  }
  return null
}

interface PartAssignment {
  name: string
  section: string
  order: number
  durationMin: number | null
  topic: string
  assignee: { firstname: string | null; lastname: string | null } | null
  assistant: { firstname: string | null; lastname: string | null } | null
}

interface ServiceRoleAssignment {
  name: string
  assignee: { firstname: string | null; lastname: string | null } | null
}

interface ProgrammeEvent {
  name: string
  startDate: Date | string
  partAssignments: PartAssignment[]
  serviceRoleAssignments: ServiceRoleAssignment[]
}

interface ProgrammeDocumentProps {
  events: ProgrammeEvent[]
  title: string
  showParts: boolean
  showServices: boolean
}

const styles = StyleSheet.create({
  page: { padding: 25, fontFamily: 'Helvetica', fontSize: 9 },
  eventBlock: { marginBottom: 15 },
  eventHeader: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    marginBottom: 1,
  },
  eventTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  eventDate: { fontSize: 9, color: '#555', marginTop: 2 },
  sectionHeader: {
    padding: '4 8',
    marginTop: 1,
  },
  sectionHeaderText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  partRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #e0e0e0',
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  partName: { width: '30%', fontSize: 8 },
  partDuration: { width: '10%', fontSize: 8, color: '#888' },
  partTopic: { width: '25%', fontSize: 8, fontFamily: 'Helvetica-Oblique' },
  partAssignee: { width: '20%', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  partAssistant: { width: '15%', fontSize: 8, color: '#555' },
  serviceSection: {
    marginTop: 4,
    padding: '4 8',
    backgroundColor: '#fafafa',
  },
  serviceSectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3, color: '#555' },
  serviceRow: { flexDirection: 'row', paddingVertical: 1 },
  serviceRoleName: { width: '40%', fontSize: 8 },
  serviceAssignee: { width: '60%', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 15, textAlign: 'center' },
  separator: { borderBottom: '1 solid #cccccc', marginVertical: 10 },
})

function formatName(user: { firstname: string | null; lastname: string | null } | null): string {
  if (!user) return '—'
  return `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim() || '—'
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function ProgrammeDocument({ events, title, showParts, showServices }: ProgrammeDocumentProps) {
  // Group events into pairs (2 per page)
  const pages: ProgrammeEvent[][] = []
  for (let i = 0; i < events.length; i += 2) {
    pages.push(events.slice(i, i + 2))
  }

  if (pages.length === 0) {
    pages.push([])
  }

  return (
    <Document>
      {pages.map((pageEvents, pageIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: pages have no stable id
        <Page key={pageIndex} size="A4" orientation="portrait" style={styles.page}>
          {pageIndex === 0 && <Text style={styles.title}>{title}</Text>}

          {pageEvents.map((event, eventIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: events on page have no stable id
            <View key={eventIndex}>
              {eventIndex > 0 && <View style={styles.separator} />}
              <EventBlock event={event} showParts={showParts} showServices={showServices} />
            </View>
          ))}
        </Page>
      ))}
    </Document>
  )
}

function EventBlock({
  event,
  showParts,
  showServices,
}: {
  event: ProgrammeEvent
  showParts: boolean
  showServices: boolean
}) {
  const sortedParts = [...event.partAssignments].sort((a, b) => a.order - b.order)

  // Group parts by section for colored headers
  const groupedParts: { section: string; parts: PartAssignment[] }[] = []
  let currentSection: string | null = null

  for (const part of sortedParts) {
    if (part.section !== currentSection) {
      currentSection = part.section
      groupedParts.push({ section: part.section, parts: [] })
    }
    groupedParts[groupedParts.length - 1].parts.push(part)
  }

  return (
    <View style={styles.eventBlock}>
      <View style={styles.eventHeader}>
        <Text style={styles.eventTitle}>{event.name}</Text>
        <Text style={styles.eventDate}>{formatDate(event.startDate)}</Text>
      </View>

      {showParts &&
        groupedParts.map((group, groupIdx) => {
          const color = sectionColor(group.section)
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: section groups have no stable id
            <View key={groupIdx}>
              {group.section !== '' && (
                <View
                  style={[styles.sectionHeader, color ? { backgroundColor: color } : { backgroundColor: '#888888' }]}
                >
                  <Text style={styles.sectionHeaderText}>{group.section}</Text>
                </View>
              )}
              {group.parts.map((part, partIdx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: part rows within a group
                <View key={partIdx} style={styles.partRow}>
                  <Text style={styles.partName}>{part.name}</Text>
                  <Text style={styles.partDuration}>{part.durationMin ? `${part.durationMin} min` : ''}</Text>
                  <Text style={styles.partTopic}>{part.topic || ''}</Text>
                  <Text style={styles.partAssignee}>{formatName(part.assignee)}</Text>
                  <Text style={styles.partAssistant}>{part.assistant ? formatName(part.assistant) : ''}</Text>
                </View>
              ))}
            </View>
          )
        })}

      {showServices && event.serviceRoleAssignments.length > 0 && (
        <View style={styles.serviceSection}>
          <Text style={styles.serviceSectionTitle}>Services</Text>
          {event.serviceRoleAssignments.map((role, roleIdx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: service role rows
            <View key={roleIdx} style={styles.serviceRow}>
              <Text style={styles.serviceRoleName}>{role.name}</Text>
              <Text style={styles.serviceAssignee}>{formatName(role.assignee)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
