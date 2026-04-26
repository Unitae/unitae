import path from 'node:path'
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { groupPartsBySlot } from '~/features/events/model/group-parts-by-slot'
import type { ExportEvent, TemplateExportConfig } from '~/features/events/server/programme-export.server'

// Register fonts lazily to avoid conflicts with TerritoryDocument.tsx which uses bare `/fonts/...`
// paths. @react-pdf/font is a singleton — the last Font.register() for the same family wins.
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

function formatName(user: { firstname: string | null; lastname: string | null } | null): string | null {
  if (!user) return null
  const name = `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim()
  return name || null
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
    marginBottom: 6,
  },
  eventSeparator: {
    borderBottom: '0.75 solid #e2e8f0',
    marginBottom: 10,
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
  // Part lines
  partBlock: {
    marginLeft: 12,
    marginBottom: 3,
  },
  partTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  partDuration: {
    fontWeight: 'normal',
    color: '#64748b',
  },
  partTopic: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#64748b',
    marginTop: 1,
  },
  partAssignee: {
    fontSize: 8,
    color: '#334155',
    marginTop: 1,
  },
  assigneeLabel: {
    color: '#94a3b8',
  },
  // Multi-track rendering
  trackBlock: {
    marginLeft: 10,
    marginTop: 2,
    marginBottom: 3,
    paddingLeft: 8,
    borderLeft: '2 solid #e2e8f0',
  },
  trackLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  // Services
  servicesDivider: {
    borderTop: '1 dotted #cbd5e1',
    marginTop: 6,
    paddingTop: 5,
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
            // biome-ignore lint/suspicious/noArrayIndexKey: events may share id across pages
            <View key={idx}>
              {idx > 0 && !templateHeader && <View style={styles.eventSeparator} />}
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
  let partCounter = 0

  return (
    <View style={styles.eventCard}>
      <View style={styles.dateHeader}>
        <Text style={styles.dateText}>{formatDate(event.startDate)}</Text>
        <Text style={styles.eventName}>{event.name}</Text>
      </View>

      {showParts &&
        sectionGroups.map((group, groupIdx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: section groups have no stable id
          <View key={groupIdx}>
            {group.section !== '' && <SectionHeader section={group.section} />}
            {group.slots.map((slot, slotIdx) => {
              partCounter++
              const num = partCounter
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: slots have no stable id
                <View key={slotIdx}>
                  {slot.parts.length === 1 ? (
                    <SinglePart part={slot.parts[0]} number={num} />
                  ) : (
                    <MultiTrackPart parts={slot.parts} number={num} />
                  )}
                </View>
              )
            })}
          </View>
        ))}

      {showServices && event.serviceRoleAssignments.length > 0 && (
        <View style={styles.servicesDivider}>
          <Text style={styles.servicesTitle}>Services</Text>
          <View style={styles.servicesGrid}>
            {event.serviceRoleAssignments.map((role, roleIdx) => {
              const name = formatName(role.assignee)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: service role rows
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

function SinglePart({ part, number }: { part: PartAssignment; number: number }) {
  const assigneeName = formatName(part.assignee)
  const assistantName = formatName(part.assistant)

  return (
    <View style={styles.partBlock}>
      <Text style={styles.partTitle}>
        {number}. {part.name}
        {part.durationMin != null && <Text style={styles.partDuration}> ({part.durationMin} min)</Text>}
      </Text>
      {part.topic !== '' && <Text style={styles.partTopic}>« {part.topic} »</Text>}
      {assigneeName && (
        <Text style={styles.partAssignee}>
          {assigneeName}
          {assistantName && <Text style={styles.assigneeLabel}> — Assistant : </Text>}
          {assistantName}
        </Text>
      )}
      {!assigneeName && <Text style={styles.unassigned}>—</Text>}
    </View>
  )
}

function MultiTrackPart({ parts, number }: { parts: PartAssignment[]; number: number }) {
  // All tracks share the same template part name/duration
  const representative = parts[0]

  return (
    <View style={styles.partBlock}>
      <Text style={styles.partTitle}>
        {number}. {representative.name}
        {representative.durationMin != null && (
          <Text style={styles.partDuration}> ({representative.durationMin} min)</Text>
        )}
      </Text>
      {parts.map((part, idx) => {
        const assigneeName = formatName(part.assignee)
        const assistantName = formatName(part.assistant)
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: track parts within a slot
          <View key={idx} style={styles.trackBlock}>
            <Text style={styles.trackLabel}>{part.track || `Salle ${idx + 1}`}</Text>
            {part.topic !== '' && <Text style={styles.partTopic}>« {part.topic} »</Text>}
            {assigneeName ? (
              <Text style={styles.partAssignee}>
                {assigneeName}
                {assistantName && <Text style={styles.assigneeLabel}> — Assistant : </Text>}
                {assistantName}
              </Text>
            ) : (
              <Text style={styles.unassigned}>—</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}
