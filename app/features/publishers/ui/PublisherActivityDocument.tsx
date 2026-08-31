import { Document, Page, Polygon, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import type { Member, PioneerEnrolment, PublisherActivity } from '~/database/generated/client'
import { standingTypeFromEnrolments } from '~/features/publishers/model/pioneer-enrolment'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'

interface PublisherActivityDocumentProps {
  publisher: Member & { activities: PublisherActivity[]; pioneerEnrolments: PioneerEnrolment[] }
}

export function PublisherActivityDocument({ publisher }: PublisherActivityDocumentProps) {
  // The pioneer boxes reflect the member's standing status, which is their ongoing stint.
  const standingType = standingTypeFromEnrolments(publisher.pioneerEnrolments)
  const year = publisher.activities.reduce((acc, activity) => {
    if (activity.year < acc) {
      return activity.year
    }

    return acc
  }, new Date().getFullYear())

  const defaultActivity = {
    hours: null,
    isPublisher: false,
    studies: null,
    type: PublisherType.Normal,
    notes: null,
  }
  const septemberActivity = publisher.activities.find(activity => activity.month === 8 && activity.year === year)
  const octoberActivity = publisher.activities.find(activity => activity.month === 9 && activity.year === year)
  const novemberActivity = publisher.activities.find(activity => activity.month === 10 && activity.year === year)
  const decemberActivity = publisher.activities.find(activity => activity.month === 11 && activity.year === year)
  const januaryActivity = publisher.activities.find(activity => activity.month === 0 && activity.year === year + 1)
  const februaryActivity = publisher.activities.find(activity => activity.month === 1 && activity.year === year + 1)
  const marchActivity = publisher.activities.find(activity => activity.month === 2 && activity.year === year + 1)
  const aprilActivity = publisher.activities.find(activity => activity.month === 3 && activity.year === year + 1)
  const mayActivity = publisher.activities.find(activity => activity.month === 4 && activity.year === year + 1)
  const juneActivity = publisher.activities.find(activity => activity.month === 5 && activity.year === year + 1)
  const julyActivity = publisher.activities.find(activity => activity.month === 6 && activity.year === year + 1)
  const augustActivity = publisher.activities.find(activity => activity.month === 7 && activity.year === year + 1)
  const activities = [
    septemberActivity ?? { year, month: 8, ...defaultActivity, id: 8 },
    octoberActivity ?? { year, month: 9, ...defaultActivity, id: 9 },
    novemberActivity ?? { year, month: 10, ...defaultActivity, id: 10 },
    decemberActivity ?? { year, month: 11, ...defaultActivity, id: 11 },
    januaryActivity ?? { year: year + 1, month: 0, ...defaultActivity, id: 0 },
    februaryActivity ?? { year: year + 1, month: 1, ...defaultActivity, id: 1 },
    marchActivity ?? { year: year + 1, month: 2, ...defaultActivity, id: 2 },
    aprilActivity ?? { year: year + 1, month: 3, ...defaultActivity, id: 3 },
    mayActivity ?? { year: year + 1, month: 4, ...defaultActivity, id: 4 },
    juneActivity ?? { year: year + 1, month: 5, ...defaultActivity, id: 5 },
    julyActivity ?? { year: year + 1, month: 6, ...defaultActivity, id: 6 },
    augustActivity ?? { year: year + 1, month: 7, ...defaultActivity, id: 7 },
  ]
  const totalHours = activities.reduce((acc, activity) => acc + (activity?.hours ?? 0), 0)

  return (
    <Document>
      <Page size={'A4'} orientation="portrait" style={{ padding: 20 }}>
        <Text style={styles.title}>{m.activity_pdf_title()}</Text>
        <Text style={[styles.text]}>
          <Text style={styles.label}>{m.activity_pdf_name_label()}</Text> {publisher.firstname} {publisher.lastname}
        </Text>
        <View style={styles.containerCols}>
          <View style={[styles.column, { flexGrow: 3, flexBasis: '50%' }]}>
            <Text style={[styles.text]}>
              <Text style={styles.label}>{m.activity_pdf_birth_date_label()}</Text>{' '}
              {publisher.birthDate?.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })}
            </Text>
            <Text style={[styles.text]}>
              <Text style={styles.label}>{m.activity_pdf_baptism_date_label()}</Text>{' '}
              {publisher.baptismDate?.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })}
            </Text>
          </View>
          <View style={[styles.column, { flexGrow: 1 }]}>
            <View style={styles.containerLabel}>
              <Checkbox checked={publisher.isMale === true} />
              <Text style={styles.label}>{m.activity_pdf_male()}</Text>
            </View>
            <View style={styles.containerLabel}>
              <Checkbox checked={publisher.isAnointed === false} />
              <Text style={styles.label}>{m.activity_pdf_other_sheep()}</Text>
            </View>
          </View>
          <View style={[styles.column, { flexGrow: 1 }]}>
            <View style={styles.containerLabel}>
              <Checkbox checked={publisher.isMale === false} />
              <Text style={styles.label}>{m.activity_pdf_female()}</Text>
            </View>
            <View style={styles.containerLabel}>
              <Checkbox checked={publisher.isAnointed === true} />
              <Text style={styles.label}>{m.activity_pdf_anointed()}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.checkboxLine, { marginTop: 5 }]}>
          <View style={styles.containerLabel}>
            <Checkbox checked={publisher.isHelder === true} />
            <Text style={styles.label}>{m.activity_pdf_elder()}</Text>
          </View>
          <View style={styles.containerLabel}>
            <Checkbox checked={publisher.isServant === true} />
            <Text style={styles.label}>{m.activity_pdf_servant()}</Text>
          </View>
          <View style={styles.containerLabel}>
            <Checkbox checked={standingType === PublisherType.PionnierPermanant} />
            <Text style={styles.label}>{m.activity_pdf_permanent_pioneer()}</Text>
          </View>
          <View style={styles.containerLabel}>
            <Checkbox checked={standingType === PublisherType.PionnierSpecial} />
            <Text style={styles.label}>{m.activity_pdf_special_pioneer()}</Text>
          </View>
        </View>
        <View style={styles.checkboxLine}>
          <View style={styles.containerLabel}>
            <Checkbox checked={standingType === PublisherType.Missionnaire} />
            <Text style={styles.label}>{m.activity_pdf_missionary()}</Text>
          </View>
        </View>

        <Table>
          <TableRow>
            <TableHeaderCell>
              <Text style={styles.label}>{m.activity_pdf_service_year()}</Text>
              <Text style={styles.label}>{m.activity_pdf_service_year_of()}</Text>
              <Text style={{ fontSize: 12 }}>
                {year} - {year + 1}
              </Text>
            </TableHeaderCell>
            <TableHeaderCell width={'15%'}>
              <Text style={styles.label}>{m.activity_pdf_participated()}</Text>
              <Text style={styles.label}>{m.activity_pdf_participated_preaching()}</Text>
            </TableHeaderCell>
            <TableHeaderCell width={'10%'}>
              <Text style={styles.label}>{m.activity_pdf_bible_studies()}</Text>
              <Text style={styles.label}>{m.activity_pdf_bible_studies_label()}</Text>
            </TableHeaderCell>
            <TableHeaderCell width={'10%'}>
              <Text style={styles.label}>{m.activity_pdf_auxiliary_pioneer()}</Text>
              <Text style={styles.label}>{m.activity_pdf_auxiliary_pioneer_label()}</Text>
            </TableHeaderCell>
            <TableHeaderCell width={'10%'}>
              <Text style={styles.label}>{m.activity_pdf_hours()}</Text>
              <Text style={{ fontSize: 9 }}>{m.activity_pdf_hours_note()}</Text>
            </TableHeaderCell>
            <TableHeaderCell width={'30%'} borderRight={true}>
              <Text style={styles.label}>{m.activity_pdf_observations()}</Text>
            </TableHeaderCell>
          </TableRow>

          {activities.map((activity, _index) => {
            if (activity == null) return null

            const month = new Date(activity.year, activity.month).toLocaleDateString('fr', { month: 'long' })

            return (
              <TableRow key={activity.id}>
                <TableCell alignLeft={true}>
                  <Text style={{ fontSize: 10 }}>{month}</Text>
                </TableCell>
                <TableCell width={'15%'}>
                  <Checkbox checked={activity.isPublisher === true} />
                </TableCell>
                <TableCell width={'10%'}>
                  <Text style={[styles.text, { fontSize: 10 }]}>{activity.studies}</Text>
                </TableCell>
                <TableCell width={'10%'}>
                  <Checkbox checked={activity.type === PublisherType.PionnierAuxiliaires} />
                </TableCell>
                <TableCell width={'10%'}>
                  <Text style={[styles.text, { fontSize: 10 }]}>
                    {activity.type === PublisherType.Normal ? '' : activity.hours}
                  </Text>
                </TableCell>
                <TableCell width={'30%'} borderRight={true}>
                  <Text style={[styles.text, { fontSize: 10 }]}>{activity.notes}</Text>
                </TableCell>
              </TableRow>
            )
          })}

          <TableRow>
            <View style={{ width: '15%', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }} />
            <View style={{ width: '15%', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }} />
            <View style={{ width: '10%', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }} />
            <View style={{ width: '10%', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={styles.label}>{m.activity_pdf_total()}</Text>
            </View>
            <TableCell width={'10%'}>
              <Text style={[styles.text, { fontSize: 10 }]}>{totalHours}</Text>
            </TableCell>
            <TableCell width={'30%'} borderRight={true}>
              <Text style={[styles.text, { fontSize: 10 }]}> - </Text>
            </TableCell>
          </TableRow>
        </Table>

        <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
          <Text style={{ fontSize: 9 }}>S-21-F 11/23</Text>
        </View>
      </Page>
    </Document>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: 900,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 20,
    marginTop: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: 900,
    fontFamily: 'Helvetica-Bold',
    color: 'black',
  },
  containerLabel: {
    display: 'flex',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  text: {
    fontSize: 11,
    fontFamily: 'Times-Roman',
  },
  containerCols: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 5,
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  checkbox: {
    padding: 0,
    margin: 0,
    height: 10,
    width: 10,
  },
  checkboxLine: {
    display: 'flex',
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
  },
})

function Table({ children }: { children: React.ReactNode }) {
  return <View style={{ marginTop: 10, width: '100%' }}>{children}</View>
}

function TableRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row' }}>{children}</View>
}

function TableHeaderCell({
  children,
  width = '15%',
  borderLeft = true,
  borderRight = false,
}: {
  children: React.ReactNode
  width?: string
  borderLeft?: boolean
  borderRight?: boolean
}) {
  return (
    <View
      style={{
        borderColor: 'black',
        borderLeftWidth: borderLeft === true ? 1 : 0,
        borderRightWidth: borderRight === true ? 1 : 0,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderStyle: 'solid',
        width,
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  )
}

function TableCell({
  children,
  width = '15%',
  borderLeft = true,
  borderRight = false,
  borderTop = false,
  alignLeft = false,
}: {
  children: React.ReactNode
  width?: string
  borderLeft?: boolean
  borderRight?: boolean
  borderTop?: boolean
  alignLeft?: boolean
}) {
  return (
    <View
      style={{
        borderColor: 'black',
        borderLeftWidth: borderLeft === true ? 1 : 0,
        borderRightWidth: borderRight === true ? 1 : 0,
        borderTopWidth: borderTop === true ? 1 : 0,
        borderBottomWidth: 1,
        borderStyle: 'solid',
        width,
        flexGrow: 1,
        alignItems: alignLeft ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: 5,
      }}
    >
      {children}
    </View>
  )
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <Svg style={styles.checkbox} viewBox="0 0 10 10">
      <Polygon style={{ stroke: 'black', strokeWidth: 2 }} points="0,0 10,0 10,10 0,10" />
      {checked && <Polygon style={{ stroke: 'black', strokeWidth: 2 }} points="4,4 6,4 6,6 4,6" />}
    </Svg>
  )
}
