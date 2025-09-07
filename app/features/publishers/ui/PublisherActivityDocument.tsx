import type { PublisherActivity, User } from '~/database/generated/client'
import { Document, Page, Polygon, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import { PublisherType } from '~/shared/types/publisher-type'

interface PublisherActivityDocumentProps {
  publisher: Omit<User, 'password'> & { activities: PublisherActivity[] }
}

export function PublisherActivityDocument({ publisher }: PublisherActivityDocumentProps) {
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
        <Text style={styles.title}>ACTIVITÉ DU PROCLAMATEUR (DOSSIER DE L’ASSEMBLÉE)</Text>
        <Text style={[styles.text]}>
          <Text style={styles.label}>Nom :</Text> {publisher.firstname} {publisher.lastname}
        </Text>
        <View style={styles.containerCols}>
          <View style={[styles.column, { flexGrow: 3, flexBasis: '50%' }]}>
            <Text style={[styles.text]}>
              <Text style={styles.label}>Date de naissance :</Text>{' '}
              {publisher.birthDate?.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })}
            </Text>
            <Text style={[styles.text]}>
              <Text style={styles.label}>Date de baptême :</Text>{' '}
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
              <Text style={styles.label}>Homme</Text>
            </View>
            <View style={styles.containerLabel}>
              <Checkbox checked={publisher.isAnointed === false} />
              <Text style={styles.label}>Autre brebis</Text>
            </View>
          </View>
          <View style={[styles.column, { flexGrow: 1 }]}>
            <View style={styles.containerLabel}>
              <Checkbox checked={publisher.isMale === false} />
              <Text style={styles.label}>Femme</Text>
            </View>
            <View style={styles.containerLabel}>
              <Checkbox checked={publisher.isAnointed === true} />
              <Text style={styles.label}>Oint</Text>
            </View>
          </View>
        </View>
        <View style={[styles.checkboxLine, { marginTop: 5 }]}>
          <View style={styles.containerLabel}>
            <Checkbox checked={publisher.isHelder === true} />
            <Text style={styles.label}>Ancien</Text>
          </View>
          <View style={styles.containerLabel}>
            <Checkbox checked={publisher.isServant === true} />
            <Text style={styles.label}>Assistant</Text>
          </View>
          <View style={styles.containerLabel}>
            <Checkbox checked={publisher.type === PublisherType.PionnierPermanant} />
            <Text style={styles.label}>Pionnier permanent</Text>
          </View>
          <View style={styles.containerLabel}>
            <Checkbox checked={publisher.type === PublisherType.PionnierSpecial} />
            <Text style={styles.label}>Pionnier spécial</Text>
          </View>
        </View>
        <View style={styles.checkboxLine}>
          <View style={styles.containerLabel}>
            <Checkbox checked={publisher.type === PublisherType.Missionnaire} />
            <Text style={styles.label}>Missionnaire affecté dans le territoire</Text>
          </View>
        </View>

        <Table>
          <TableRow>
            <TableHeaderCell>
              <Text style={styles.label}>Année</Text>
              <Text style={styles.label}>de service</Text>
              <Text style={{ fontSize: 12 }}>
                {year} - {year + 1}
              </Text>
            </TableHeaderCell>
            <TableHeaderCell width={'15%'}>
              <Text style={styles.label}>A participé</Text>
              <Text style={styles.label}>à la prédication</Text>
            </TableHeaderCell>
            <TableHeaderCell width={'10%'}>
              <Text style={styles.label}>Cours</Text>
              <Text style={styles.label}>bibliques</Text>
            </TableHeaderCell>
            <TableHeaderCell width={'10%'}>
              <Text style={styles.label}>Pionnier</Text>
              <Text style={styles.label}>auxiliaire</Text>
            </TableHeaderCell>
            <TableHeaderCell width={'10%'}>
              <Text style={styles.label}>Heures</Text>
              <Text style={{ fontSize: 9 }}>(si pionnier ou missionnaire)</Text>
            </TableHeaderCell>
            <TableHeaderCell width={'30%'} borderRight={true}>
              <Text style={styles.label}>Observations</Text>
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
              <Text style={styles.label}>Total</Text>
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
