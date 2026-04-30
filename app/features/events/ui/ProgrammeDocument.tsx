import path from 'node:path'
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

const fontsDir = path.join(process.cwd(), 'public', 'fonts')

Font.register({
  family: 'Fira Sans',
  fonts: [
    { src: path.join(fontsDir, 'FiraSans-Regular.ttf') },
    { src: path.join(fontsDir, 'FiraSans-Bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'FiraSans-Italic.ttf'), fontStyle: 'italic' },
    { src: path.join(fontsDir, 'FiraSans-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
  ],
})

// JW workbook section colors
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
  track: string
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
  page: {
    padding: '30 35',
    fontFamily: 'Fira Sans',
    fontSize: 8.5,
    color: '#1a1a1a',
  },
  // Document title
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  // Event block
  eventBlock: {
    marginBottom: 8,
    borderRadius: 4,
    border: '0.75 solid #e2e8f0',
    overflow: 'hidden',
  },
  eventHeader: {
    backgroundColor: '#2c3e50',
    padding: '8 12',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  eventDate: {
    fontSize: 8.5,
    color: '#cbd5e1',
  },
  // Section header (colored bar)
  sectionHeader: {
    padding: '4 12',
    borderTop: '0.5 solid rgba(255,255,255,0.15)',
  },
  sectionHeaderText: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // Part rows
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottom: '0.5 solid #f1f5f9',
    minHeight: 18,
  },
  partRowAlt: {
    backgroundColor: '#f8fafc',
  },
  partName: {
    width: '28%',
    fontSize: 8,
    color: '#334155',
  },
  partDuration: {
    width: '8%',
    fontSize: 7,
    color: '#94a3b8',
    textAlign: 'center',
  },
  partTopic: {
    width: '29%',
    fontSize: 7.5,
    fontStyle: 'italic',
    color: '#64748b',
    paddingHorizontal: 4,
  },
  partAssignee: {
    width: '20%',
    fontSize: 8,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  partAssistant: {
    width: '15%',
    fontSize: 7.5,
    color: '#64748b',
  },
  // Services section
  serviceSection: {
    borderTop: '1 solid #e2e8f0',
    padding: '6 12',
    backgroundColor: '#f8fafc',
  },
  serviceSectionTitle: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  serviceItem: {
    width: '50%',
    flexDirection: 'row',
    paddingVertical: 2,
  },
  serviceRoleName: {
    fontSize: 7.5,
    color: '#64748b',
    width: '45%',
  },
  serviceAssignee: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#334155',
    width: '55%',
  },
  // Page separator
  separator: {
    marginVertical: 10,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 35,
    right: 35,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '0.5 solid #e2e8f0',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 6.5,
    color: '#94a3b8',
  },
  // Unassigned indicator
  unassigned: {
    fontSize: 7.5,
    color: '#cbd5e1',
    fontStyle: 'italic',
  },
})

function formatName(user: { firstname: string | null; lastname: string | null } | null): string | null {
  if (!user) return null
  const name = `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim()
  return name || null
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function ProgrammeDocument({ events, title, showParts, showServices }: ProgrammeDocumentProps) {
  const pages: ProgrammeEvent[][] = []
  for (let i = 0; i < events.length; i += 2) {
    pages.push(events.slice(i, i + 2))
  }

  if (pages.length === 0) {
    pages.push([])
  }

  const totalPages = pages.length

  return (
    <Document>
      {pages.map((pageEvents, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="portrait" style={styles.page}>
          {pageIndex === 0 && <Text style={styles.title}>{title}</Text>}

          {pageEvents.map((event, eventIndex) => (
            <View key={eventIndex}>
              {eventIndex > 0 && <View style={styles.separator} />}
              <EventBlock event={event} showParts={showParts} showServices={showServices} />
            </View>
          ))}

          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>Unitae</Text>
            <Text style={styles.footerText}>
              Page {pageIndex + 1} / {totalPages}
            </Text>
          </View>
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

  let rowIndex = 0

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
            <View key={groupIdx}>
              {group.section !== '' && (
                <View style={[styles.sectionHeader, { backgroundColor: color ?? '#64748b' }]}>
                  <Text style={styles.sectionHeaderText}>{group.section}</Text>
                </View>
              )}
              {group.parts.map((part, partIdx) => {
                const isAlt = rowIndex % 2 === 1
                rowIndex++
                return <PartRow key={partIdx} part={part} isAlt={isAlt} />
              })}
            </View>
          )
        })}

      {showServices && event.serviceRoleAssignments.length > 0 && (
        <View style={styles.serviceSection}>
          <Text style={styles.serviceSectionTitle}>Services</Text>
          <View style={styles.serviceGrid}>
            {event.serviceRoleAssignments.map((role, roleIdx) => {
              const name = formatName(role.assignee)
              return (
                <View key={roleIdx} style={styles.serviceItem}>
                  <Text style={styles.serviceRoleName}>{role.name}</Text>
                  {name ? <Text style={styles.serviceAssignee}>{name}</Text> : <Text style={styles.unassigned}>—</Text>}
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}

function PartRow({ part, isAlt }: { part: PartAssignment; isAlt: boolean }) {
  const assigneeName = formatName(part.assignee)
  const assistantName = part.assistant ? formatName(part.assistant) : null
  const displayName = part.track ? `${part.name} — ${part.track}` : part.name

  return (
    <View style={[styles.partRow, isAlt ? styles.partRowAlt : {}]}>
      <Text style={styles.partName}>{displayName}</Text>
      <Text style={styles.partDuration}>{part.durationMin ? `${part.durationMin}'` : ''}</Text>
      <Text style={styles.partTopic}>{part.topic || ''}</Text>
      {assigneeName ? (
        <Text style={styles.partAssignee}>{assigneeName}</Text>
      ) : (
        <Text style={styles.unassigned}>—</Text>
      )}
      {assistantName ? (
        <Text style={styles.partAssistant}>{assistantName}</Text>
      ) : (
        <Text style={styles.partAssistant} />
      )}
    </View>
  )
}
