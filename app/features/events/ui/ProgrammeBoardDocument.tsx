import path from 'node:path'
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { groupPartsBySlot } from '~/features/events/model/group-parts-by-slot'
import type { ExportEvent, TemplateExportConfig } from '~/features/events/server/programme-export.server'
import { formatMemberName, getPartAssigneeDisplay } from '~/features/events/ui/part-display'

function ensureFontsRegistered() {
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
}

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

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

interface ProgrammeBoardDocumentProps {
  events: ExportEvent[]
  configMap: Map<number, Omit<TemplateExportConfig, 'templateId'>>
  groupBy: 'date' | 'template'
  title: string
  congregationName: string
}

type PartAssignment = ExportEvent['partAssignments'][number]

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
    fontFamily: 'Fira Sans',
    fontSize: 9,
    color: '#1a1a1a',
  },
  congregationName: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  templateGroupHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: '1 solid #e2e8f0',
  },
  // Event card
  eventCard: {
    marginBottom: 14,
  },
  dateHeader: {
    backgroundColor: '#f1f5f9',
    padding: '5 10',
    marginBottom: 4,
    borderRadius: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  eventName: {
    fontSize: 8.5,
    color: '#64748b',
  },
  // Section header with colored bar
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 2,
  },
  sectionBar: {
    width: 4,
    height: 14,
    borderRadius: 1,
    marginRight: 8,
  },
  sectionName: {
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#ffffff',
  },
  sectionNameContainer: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 2,
  },
  // Part lines — single row: name (duration) ........... assignee
  partRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 12,
    marginBottom: 2,
  },
  partLeft: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  partDuration: {
    fontWeight: 'normal',
    color: '#64748b',
  },
  partDotsContainer: {
    flex: 1,
    marginHorizontal: 4,
    maxHeight: 9, // clip to single line at fontSize 7
    overflow: 'hidden',
  },
  partDotsText: {
    fontSize: 7,
    color: '#cbd5e1',
  },
  partRight: {
    fontSize: 8.5,
    color: '#334155',
    textAlign: 'right',
  },
  partAssistant: {
    fontSize: 8,
    color: '#94a3b8',
  },
  unassignedRight: {
    fontSize: 8.5,
    color: '#cbd5e1',
    fontStyle: 'italic',
    textAlign: 'right',
  },
  // Multi-track rendering
  trackRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 22,
    marginBottom: 1,
  },
  trackLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flexShrink: 0,
  },
  // Services
  servicesDivider: {
    borderTop: '0.75 solid #e2e8f0',
    marginTop: 6,
    marginLeft: 12,
    paddingTop: 5,
  },
  servicesNoDivider: {
    marginLeft: 12,
  },
  servicesTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  serviceItem: {
    width: '50%',
    flexDirection: 'row',
    paddingVertical: 2,
  },
  serviceRoleName: {
    fontSize: 8,
    color: '#64748b',
    width: '45%',
  },
  serviceAssignee: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#334155',
    width: '55%',
  },
  unassigned: {
    fontSize: 8,
    color: '#cbd5e1',
    fontStyle: 'italic',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '0.5 solid #e2e8f0',
    paddingTop: 5,
  },
  footerText: {
    fontSize: 6.5,
    color: '#94a3b8',
  },
})

export function ProgrammeBoardDocument({
  events,
  configMap,
  groupBy,
  title,
  congregationName,
}: ProgrammeBoardDocumentProps) {
  ensureFontsRegistered()

  const orderedEvents =
    groupBy === 'template'
      ? [...events].sort((a, b) => {
          const nameA = a.template?.name ?? ''
          const nameB = b.template?.name ?? ''
          if (nameA !== nameB) return nameA.localeCompare(nameB)
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        })
      : events

  // When grouping by template, track which template groups we've already shown a header for
  const seenTemplates = new Set<number>()

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.congregationName}>{congregationName}</Text>
        <Text style={styles.title}>{title}</Text>

        {orderedEvents.map((event, idx) => {
          const config = event.templateId ? configMap.get(event.templateId) : null
          const showParts = config?.parts ?? true
          const showServices = config?.services ?? true

          // Template group header when grouping by template
          let templateHeader: string | null = null
          if (groupBy === 'template' && event.templateId && !seenTemplates.has(event.templateId)) {
            seenTemplates.add(event.templateId)
            templateHeader = event.template?.name ?? null
          }

          return (
            <View key={idx}>
              {templateHeader && <Text style={styles.templateGroupHeader}>{templateHeader}</Text>}
              <EventCard event={event} showParts={showParts} showServices={showServices} />
            </View>
          )
        })}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{congregationName}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

function EventCard({
  event,
  showParts,
  showServices,
}: {
  event: ExportEvent
  showParts: boolean
  showServices: boolean
}) {
  const sectionGroups = groupPartsBySlot(event.partAssignments)

  return (
    <View style={styles.eventCard}>
      <View style={styles.dateHeader}>
        <Text style={styles.dateText}>{formatDate(event.startDate)}</Text>
        <Text style={styles.eventName}>{event.name}</Text>
      </View>

      {showParts &&
        sectionGroups.map((group, groupIdx) => (
          <View key={groupIdx}>
            {group.section !== '' && <SectionHeader section={group.section} />}
            {group.slots.map((slot, slotIdx) => (
              <View key={slotIdx}>
                {slot.parts.length === 1 ? <SinglePart part={slot.parts[0]} /> : <MultiTrackPart parts={slot.parts} />}
              </View>
            ))}
          </View>
        ))}

      {showServices && event.serviceRoleAssignments.length > 0 && (
        <View style={showParts ? styles.servicesDivider : styles.servicesNoDivider}>
          <Text style={styles.servicesTitle}>Services</Text>
          <View style={styles.servicesGrid}>
            {event.serviceRoleAssignments.map((role, roleIdx) => {
              const name = formatMemberName(role.assignee)
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

function SectionHeader({ section }: { section: string }) {
  const color = sectionColor(section) ?? '#64748b'
  return (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionBar, { backgroundColor: color }]} />
      <View style={[styles.sectionNameContainer, { backgroundColor: color }]}>
        <Text style={styles.sectionName}>{section}</Text>
      </View>
    </View>
  )
}

// Long dot string — the flex container + maxHeight clip it to one line
const DOT_LEADER = ' .'.repeat(200)

function formatPartRightText(part: PartAssignment): string | null {
  const { primary, assistant } = getPartAssigneeDisplay(part)
  if (!primary) return null
  if (assistant) return `${primary} / ${assistant}`
  return primary
}

function DotLeader() {
  return (
    <View style={styles.partDotsContainer}>
      <Text style={styles.partDotsText}>{DOT_LEADER}</Text>
    </View>
  )
}

function SinglePart({ part }: { part: PartAssignment }) {
  const rightText = formatPartRightText(part)
  const displayName = part.topic !== '' ? part.topic : part.name

  return (
    <View style={styles.partRow}>
      <Text style={styles.partLeft}>
        {displayName}
        {part.durationMin != null && <Text style={styles.partDuration}> ({part.durationMin} min)</Text>}
      </Text>
      <DotLeader />
      {rightText ? <Text style={styles.partRight}>{rightText}</Text> : <Text style={styles.unassignedRight}>—</Text>}
    </View>
  )
}

function MultiTrackPart({ parts }: { parts: PartAssignment[] }) {
  const representative = parts[0]
  const displayName = representative.topic !== '' ? representative.topic : representative.name

  return (
    <View>
      <View style={styles.partRow}>
        <Text style={styles.partLeft}>
          {displayName}
          {representative.durationMin != null && (
            <Text style={styles.partDuration}> ({representative.durationMin} min)</Text>
          )}
        </Text>
      </View>
      {parts.map((part, idx) => {
        const rightText = formatPartRightText(part)
        const trackName = part.track || `Salle ${idx + 1}`
        return (
          <View key={idx} style={styles.trackRow}>
            <Text style={styles.trackLabel}>{trackName}</Text>
            <DotLeader />
            {rightText ? (
              <Text style={styles.partRight}>{rightText}</Text>
            ) : (
              <Text style={styles.unassignedRight}>—</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}
