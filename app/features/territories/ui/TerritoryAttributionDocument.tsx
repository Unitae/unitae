import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { Attribution, Territory, User } from '~/database/generated/client'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'

type TerritoryRepport = Territory & { attributions: (Attribution & { publisher: User })[] }

interface TerritoryAttributionDocumentProps {
  year: number
  territories?: TerritoryRepport[]
}

export function TerritoryAttributionDocument({
  year,
  territories = [
    {
      attributions: [],
      id: 1,
      number: '-',
      createdAt: new Date(),
      updatedAt: new Date(),
      notes: '',
      type: TerritoryKind.Classical,
      congregationId: 0,
    },
  ],
}: TerritoryAttributionDocumentProps) {
  const territoryPages = territories.reduce<(typeof territories)[]>(
    (acc, territory) => {
      if (acc[acc.length - 1] != null && acc[acc.length - 1].length < 15) {
        acc[acc.length - 1].push(territory)
        return acc
      }

      acc.push([territory])
      return acc
    },
    [[]],
  )

  return (
    <Document>
      {territoryPages.map((territoriesOfPage, index) => (
        <Page key={index} size={'A4'} orientation="portrait" style={{ padding: 20 }}>
          <Text style={styles.title}>{m.territory_s13_title()}</Text>
          <Text style={[styles.text]}>
            <Text style={styles.label}>{m.territory_s13_service_year()}</Text> {year}
          </Text>

          <Table>
            <TableRow>
              <TableHeaderCell width="7%" borderLeft={3}>
                <Text style={{ fontSize: 8, fontWeight: 500, fontFamily: 'Helvetica' }}>
                  {m.territory_s13_territory_number()}
                </Text>
              </TableHeaderCell>
              <TableHeaderCell width="13%">
                <Text style={{ fontSize: 8, fontWeight: 500, fontFamily: 'Helvetica' }}>
                  {m.territory_s13_last_covered()}
                </Text>
                <Text style={{ fontSize: 8, fontWeight: 500, fontFamily: 'Helvetica' }}>
                  {m.territory_s13_last_covered_line2()}
                </Text>
                <Text style={{ fontSize: 8, fontWeight: 500, fontFamily: 'Helvetica' }}>
                  {m.territory_s13_last_covered_line3()}
                </Text>
              </TableHeaderCell>
              <AttributionHeaderCell width="20%" borderLeft={3} />
              <AttributionHeaderCell width="20%" />
              <AttributionHeaderCell width="20%" />
              <AttributionHeaderCell width="20%" borderRight={3} />
            </TableRow>

            {territoriesOfPage.map((territory, territoryIndex) => {
              if (territory == null) return null
              const attributions = [
                territory.attributions[0] ?? { publisher: null, startDate: null, endDate: null, id: 1 },
                territory.attributions[1] ?? { publisher: null, startDate: null, endDate: null, id: 1 },
                territory.attributions[2] ?? { publisher: null, startDate: null, endDate: null, id: 1 },
                territory.attributions[3] ?? { publisher: null, startDate: null, endDate: null, id: 1 },
              ]

              return (
                <TableRow key={territory.id}>
                  <TableCell
                    borderLeft={3}
                    width={'7%'}
                    borderBottom={territoryIndex === territoriesOfPage.length - 1 ? 3 : 1}
                  >
                    <Text style={[styles.text, { fontSize: 10 }]}>{territory.number}</Text>
                  </TableCell>
                  <TableCell width={'13%'} borderBottom={territoryIndex === territoriesOfPage.length - 1 ? 3 : 1}>
                    <Text style={[styles.text, { fontSize: 10 }]}> </Text>
                  </TableCell>
                  {attributions
                    .sort((a, b) => a.startDate?.getTime() - b.startDate?.getTime())
                    .map((attribution, index) => (
                      <AttributionCell
                        key={attribution.id}
                        publisherName={`${attribution.publisher?.firstname ?? ''} ${attribution.publisher?.lastname?.toLocaleUpperCase() ?? ''}`}
                        attributionDate={attribution.startDate}
                        attributionEndDate={attribution.endDate}
                        borderLeft={index === 0 ? 3 : 2}
                        borderRight={index === attributions.length - 1 ? 3 : 0}
                        borderBottom={territoryIndex === territoriesOfPage.length - 1 ? 3 : 1}
                      />
                    ))}
                </TableRow>
              )
            })}
          </Table>
          <Text style={{ fontSize: 9, fontWeight: 500, fontFamily: 'Helvetica', color: 'black' }}>
            {m.territory_s13_footnote()}
          </Text>

          <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
            <Text style={{ fontSize: 9 }}>S-13-F 1/22</Text>
          </View>
        </Page>
      ))}
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
    fontSize: 9,
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
  borderLeft = 1,
  borderRight = 0,
}: {
  children: React.ReactNode
  width?: string
  borderLeft?: number
  borderRight?: number
}) {
  return (
    <View
      style={{
        borderColor: 'black',
        borderLeftWidth: borderLeft,
        borderRightWidth: borderRight,
        borderTopWidth: 3,
        borderBottomWidth: 1,
        borderStyle: 'solid',
        width,
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#cfcfcf',
      }}
    >
      {children}
    </View>
  )
}

function TableCell({
  children,
  width = '15%',
  borderLeft = 1,
  borderRight = 0,
  borderTop = 0,
  borderBottom = 1,
  alignLeft = false,
}: {
  children: React.ReactNode
  width?: string
  borderLeft?: number
  borderRight?: number
  borderTop?: number
  borderBottom?: number
  alignLeft?: boolean
}) {
  return (
    <View
      style={{
        borderColor: 'black',
        borderLeftWidth: borderLeft,
        borderRightWidth: borderRight,
        borderTopWidth: borderTop,
        borderBottomWidth: borderBottom,
        borderStyle: 'solid',
        width,
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: alignLeft ? 'flex-start' : 'center',
      }}
    >
      {children}
    </View>
  )
}

function AttributionHeaderCell({
  width = '15%',
  borderLeft = 2,
  borderRight = 0,
  borderTop = 3,
  alignLeft = false,
}: {
  width?: string
  borderLeft?: number
  borderRight?: number
  borderTop?: number
  alignLeft?: boolean
}) {
  return (
    <View
      style={{
        borderColor: 'black',
        borderLeftWidth: borderLeft,
        borderRightWidth: borderRight,
        borderTopWidth: borderTop,
        borderBottomWidth: 1,
        borderStyle: 'solid',
        width,
        flexGrow: 1,
        alignItems: alignLeft ? 'flex-start' : 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        backgroundColor: '#cfcfcf',
      }}
    >
      <Text
        style={{
          fontSize: 8,
          fontWeight: 500,
          fontFamily: 'Helvetica',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 4,
        }}
      >
        {m.territory_s13_assigned_to()}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', width: '100%' }}>
        <View
          style={{
            borderTopWidth: 1,
            borderColor: 'black',
            width: '50%',
            padding: 4,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 8, fontWeight: 500, fontFamily: 'Helvetica' }}>
            {m.territory_s13_assigned_date()}
          </Text>
        </View>
        <View
          style={{
            borderTopWidth: 1,
            borderLeftWidth: 1,
            width: '50%',
            borderColor: 'black',
            padding: 4,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 8, fontWeight: 500, fontFamily: 'Helvetica' }}>
            {m.territory_s13_fully_covered()}
          </Text>
          <Text style={{ fontSize: 8, fontWeight: 500, fontFamily: 'Helvetica' }}>
            {m.territory_s13_fully_covered_line2()}
          </Text>
        </View>
      </View>
    </View>
  )
}

function AttributionCell({
  publisherName,
  attributionDate = null,
  attributionEndDate = null,
  width = '20%',
  borderLeft = 2,
  borderRight = 0,
  borderTop = 0,
  borderBottom = 1,
  alignLeft = false,
}: {
  width?: string
  borderLeft?: number
  borderRight?: number
  borderTop?: number
  borderBottom?: number
  alignLeft?: boolean
  publisherName: string
  attributionDate?: Date | null
  attributionEndDate?: Date | null
}) {
  return (
    <View
      style={{
        borderColor: 'black',
        borderLeftWidth: borderLeft,
        borderRightWidth: borderRight,
        borderTopWidth: borderTop,
        borderBottomWidth: borderBottom,
        borderStyle: 'solid',
        width,
        flexGrow: 1,
        alignItems: alignLeft ? 'flex-start' : 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      <Text
        style={[
          styles.text,
          { justifyContent: 'center', alignItems: 'center', padding: 4, fontSize: 8, minHeight: 20 },
        ]}
      >
        {publisherName}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', width: '100%' }}>
        <View
          style={{
            borderTopWidth: 1,
            borderColor: 'black',
            width: '50%',
            padding: 4,
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 20,
          }}
        >
          <Text style={[styles.text, { fontSize: 9 }]}>{attributionDate?.toLocaleDateString()}</Text>
        </View>
        <View
          style={{
            borderTopWidth: 1,
            borderLeftWidth: 1,
            width: '50%',
            borderColor: 'black',
            padding: 4,
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 20,
          }}
        >
          <Text style={[styles.text, { fontSize: 9 }]}>{attributionEndDate?.toLocaleDateString()}</Text>
        </View>
      </View>
    </View>
  )
}
