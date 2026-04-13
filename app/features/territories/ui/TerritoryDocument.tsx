import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { BuildingAccess } from '~/database/generated/client'
import * as m from '~/paraglide/messages'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { Entrance } from '~/shared/types/entrance'

Font.register({
  family: 'Fira Sans',
  fonts: [
    { src: '/fonts/FiraSans-Regular.ttf' },
    { src: '/fonts/FiraSans-Bold.ttf', fontWeight: 'bold' },
    { src: '/fonts/FiraSans-Italic.ttf', fontStyle: 'italic' },
    { src: '/fonts/FiraSans-BoldItalic.ttf', fontWeight: 'bold', fontStyle: 'italic' },
  ],
})

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    color: '#020617',
    padding: 10,
    justifyContent: 'space-between',
    fontFamily: 'Fira Sans',
  },
  header: {
    fontSize: 16,
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  footer: {
    fontSize: 12,
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  title: {
    fontWeight: 'extrabold',
  },
  type: {
    fontSize: 12,
    color: '#0f766e',
  },
  primary: {
    fontSize: 12,
    color: '#020617',
  },
  secondary: {
    fontSize: 11,
    color: '#94a3b8',
  },
  alt: {
    fontSize: 11,
    color: '#475569',
  },
  alert: {
    fontSize: 12,
    color: '#ff0000',
    fontStyle: 'italic',
  },
  building: {
    marginTop: 20,
    flexGrow: 1,
  },
  map: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerMap: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 15,
    color: '#e6b32f',
    position: 'absolute',
    bottom: 0,
    fontSize: 10,
    width: '100%',
    fontFamily: 'Fira Sans',
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  watermark: {
    color: 'red',
    position: 'absolute',
    fontSize: 40,
    transform: 'rotate(-40deg)',
    top: '40%',
    left: '15%',
    opacity: 0.2,
    fontWeight: 'extrabold',
  },
})

interface TerritoryDocumentProps {
  name: string
  type: TerritoryKind
  entrances: Entrance[]
  googleMapId: string | undefined
  googleMapKey: string | undefined
  showPhone?: boolean
  owner?: string
  restitutionDate?: Date
  attributionType?: TerritoryAttributionKind
}

export function TerritoryDocument({
  name,
  type = TerritoryKind.Classical,
  entrances = [],
  googleMapKey,
  googleMapId,
  showPhone = false,
  owner,
  restitutionDate,
  attributionType = TerritoryAttributionKind.Default,
}: TerritoryDocumentProps) {
  let unit = m.territory_doc_unit_entrances()
  if (type === TerritoryKind.Phone) {
    unit = m.territory_doc_unit_phones()
  }
  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    unit = m.territory_doc_unit_homes()
  }

  let quantity = entrances.length
  if (type === TerritoryKind.Phone) {
    quantity = entrances.reduce((acc, entrance) => acc + (entrance.phones ?? 0), 0)
  }
  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    quantity = entrances.reduce((acc, entrance) => acc + ((entrance.homes ?? 0) || (entrance.phones ?? 0)), 0)
  }

  const size = '300x450'
  const scale = 2
  const zoom = 13
  const center = '45.7259019,4.8346763'
  const marker = entrances
    .map(entrance => {
      const firstBuilding = entrance.buildings[0]
      return `${firstBuilding.latitude},${firstBuilding.longitude}`
    })
    .shift()

  return (
    <Document>
      <Page size={{ width: 270, height: 425 }} style={styles.page}>
        <View>
          <View style={styles.header}>
            <Text style={styles.title}>{m.territory_doc_title({ name })}</Text>
            <Text style={styles.alt}>
              {quantity} {unit}
            </Text>
          </View>
          <TypeInformations type={type} />
          {entrances.map(entrance => {
            if (type === TerritoryKind.Commerces) {
              return <CommerceInformations key={entrance.id} entrance={entrance} />
            }

            return <EntranceInformations key={entrance.id} entrance={entrance} canShowPhone={showPhone} />
          })}
        </View>
        <View style={styles.footer}>
          <Text style={styles.alt}>{m.territory_doc_checked_out_by()} {owner ?? '........................'}</Text>
          <Text style={styles.alt}>{m.territory_doc_return_by()} {restitutionDate?.toLocaleDateString('fr') ?? '..................'}</Text>
        </View>
        <DocumentWaterMark type={attributionType} />
      </Page>
      {googleMapKey != null && googleMapKey.length > 0 && (
        <Page size={{ width: 270, height: 425 }} style={styles.map}>
          <Image
            src={`https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=${zoom}&size=${size}&maptype=roadmap&markers=color:yellow|${marker}&key=${googleMapKey}${googleMapId ? `&map_id=${googleMapId}` : ''}&scale=${scale}&path=color:0xC2175Bff%7Cweight:1%7Cfillcolor:0xC2175B80%7C45.7511927,4.8229874%7C45.7492189,4.820051%7C45.7482237,4.8185312%7C45.7471537,4.8172046%7C45.7460151,4.8160314%7C45.745176,4.8154805%7C45.7443374,4.8147885%7C45.7437534,4.8146115%7C45.7429036,4.8142842%7C45.7420538,4.8141286%7C45.7408039,4.8139071%7C45.7395241,4.8139859%7C45.7371204,4.8145009%7C45.733144,4.8153485%7C45.7322229,4.8156059%7C45.7316987,4.8167754%7C45.7309123,4.8176338%7C45.7299943,4.8181235%7C45.7282001,4.8184738%7C45.7282001,4.8186455%7C45.7292635,4.818624%7C45.7308587,4.8186562%7C45.7324689,4.8189244%7C45.7348652,4.8197398%7C45.7371417,4.82092%7C45.7486574,4.8310051%7C45.7511927,4.8229874&path=color:0x0E9A6Cff%7Cweight:1%7Cfillcolor:0x0E9A6C80%7C45.7479761,4.8330435%7C45.7422258,4.8278771%7C45.7392832,4.8254337%7C45.7372203,4.8237079%7C45.7363405,4.8232052%7C45.7346855,4.8218963%7C45.7318922,4.8211882%7C45.7301622,4.8207483%7C45.7284173,4.8206518%7C45.7259682,4.8205016%7C45.7196252,4.8218287%7C45.716357,4.8238275%7C45.7141344,4.8253692%7C45.7126511,4.8278154%7C45.7105684,4.8335983%7C45.7089277,4.8376752%7C45.7041776,4.8399818%7C45.7034957,4.8407758%7C45.7019222,4.8420311%7C45.7022969,4.8428787%7C45.7027315,4.8447991%7C45.7036231,4.8443807%7C45.705279,4.8439408%7C45.7151981,4.8432005%7C45.7156701,4.8434366%7C45.7160072,4.8443378%7C45.716524,4.849831%7C45.7246115,4.8484931%7C45.7262315,4.8479856%7C45.7278792,4.8481143%7C45.7293284,4.8485113%7C45.7390651,4.8475275%7C45.7416859,4.8469052%7C45.7440219,4.8453603%7C45.7479761,4.8330435&path=color:0x2289BCff%7Cweight:1%7Cfillcolor:0x2289BC80%7C45.7440219,4.8453603%7C45.7416859,4.8469052%7C45.7390651,4.8475275%7C45.7293284,4.8485113%7C45.7293771,4.8521913%7C45.7297665,4.8537417%7C45.7358961,4.8531194%7C45.7374207,4.8525264%7C45.7405681,4.8514579%7C45.7423277,4.8507337%7C45.7440219,4.8453603`}
          />
          <View style={styles.footerMap}>
            <Image src="/marker-google.jpg" style={{ height: 20 }} />
            <Text>{m.territory_doc_map_position()}</Text>
          </View>
        </Page>
      )}
    </Document>
  )
}

function DocumentWaterMark({ type }: { type: TerritoryAttributionKind }) {
  if (type === TerritoryAttributionKind.Campaign) {
    return <Text style={styles.watermark}>{m.territory_doc_watermark_campaign()}</Text>
  }

  if (type === TerritoryAttributionKind.Phone) {
    return <Text style={[styles.watermark, { color: '#0f766e', left: '10%' }]}>{m.territory_doc_watermark_phones()}</Text>
  }

  return null
}

function TypeInformations({ type }: { type: TerritoryKind }) {
  return (
    <Text style={styles.type}>
      {type === TerritoryKind.Phone && m.territories_type_phone_singular()}
      {type === TerritoryKind.Univ && m.territories_type_university_singular()}
      {type === TerritoryKind.Commerces && m.territory_doc_type_commerce()}
      {type === TerritoryKind.Hotel && m.territories_type_hotel_singular()}
    </Text>
  )
}

function formatAccessLabel(accessType: number): string {
  if (accessType === TerritoryAccess.Intercom) return m.territory_doc_access_intercom()
  if (accessType === TerritoryAccess.Code) return m.territory_doc_access_digicode()
  if (accessType === TerritoryAccess.Doorbell) return m.territory_doc_access_doorbell()
  return ''
}

function formatAccessSequence(entrance: Entrance): string {
  const accesses: BuildingAccess[] = entrance.accesses ?? []
  if (accesses.length > 0) {
    return accesses
      .map(a => formatAccessLabel(a.type))
      .filter(Boolean)
      .join(' → ')
  }

  // Fallback to old single access field
  if (entrance.access != null) {
    return formatAccessLabel(entrance.access)
  }

  return ''
}

function EntranceInformations({ entrance, canShowPhone }: { entrance: Entrance; canShowPhone: boolean }) {
  const firstBuilding = entrance.buildings[0]
  const numbers = entrance.buildings.map(building => building.number).join(', ')
  const phones = entrance.phones ?? 0

  const accessText = formatAccessSequence(entrance)
  const hasCode =
    (entrance.accesses ?? []).some(a => a.type === TerritoryAccess.Code) || entrance.access === TerritoryAccess.Code

  return (
    <View key={entrance.id} style={styles.building}>
      <Text style={styles.primary}>
        {numbers} {firstBuilding.street}, {firstBuilding.zip}
      </Text>
      <Text style={styles.secondary}>
        {accessText.length > 0 && `${accessText}. `}
        {hasCode && entrance.isOpenEarly === true && `${m.territory_doc_open_morning()} `}
        {hasCode && entrance.isMailboxOpen === true && `${m.territory_doc_mailbox_accessible()} `}
        {canShowPhone && phones > 0 && `${phones} tél.`}
      </Text>
      {entrance.notes.length > 0 && <Text style={styles.alert}>{entrance.notes}</Text>}
    </View>
  )
}

function CommerceInformations({ entrance }: { entrance: Entrance }) {
  const firstBuilding = entrance.buildings[0]
  const numbers = entrance.buildings.map(building => building.number).join(', ')

  const shopLabel = shopKindLabels[entrance.shopKind as ShopKind] ?? 'Autres'

  return (
    <View key={entrance.id} style={styles.building}>
      <Text style={styles.primary}>
        {numbers} {firstBuilding.street}, {firstBuilding.zip}
      </Text>
      <Text style={styles.secondary}>{shopLabel}. </Text>
      {entrance.notes.length > 0 && <Text style={styles.alert}>{entrance.notes}</Text>}
    </View>
  )
}
