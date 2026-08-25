import path from 'node:path'
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatAccessSequence } from '~/features/territories/model/access-format'
import type { CardOverlay } from '~/features/territories/model/card-overlay'
import { shopKindLabels as getShopKindLabels, type ShopKind } from '~/features/territories/model/shop-kind.type'
import { buildTerritoryStaticMapUrl } from '~/features/territories/model/static-map-url'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import type { Entrance } from '~/shared/types/entrance'

const publicDir = path.join(process.cwd(), 'public')
const fontsDir = path.join(publicDir, 'fonts')
Font.register({
  family: 'Fira Sans',
  fonts: [
    { src: path.join(fontsDir, 'FiraSans-Regular.ttf') },
    { src: path.join(fontsDir, 'FiraSans-Bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'FiraSans-Italic.ttf'), fontStyle: 'italic' },
    { src: path.join(fontsDir, 'FiraSans-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
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
  type: TerritoryKindKey
  entrances: Entrance[]
  googleMapId: string | undefined
  googleMapKey: string | undefined
  overlays?: CardOverlay[]
  perimeter?: { lat: number; lng: number }[] | null
  showPhone?: boolean
  owner?: string
  restitutionDate?: Date
  attributionType?: TerritoryAttributionKind
  attributionCampaign?: boolean
}

export function TerritoryDocument({
  name,
  type = TerritoryKindKey.Classical,
  entrances = [],
  googleMapKey,
  googleMapId,
  overlays = [],
  perimeter = null,
  showPhone = false,
  owner,
  restitutionDate,
  attributionType = TerritoryAttributionKind.Default,
  attributionCampaign = false,
}: TerritoryDocumentProps) {
  let unit = m.territory_doc_unit_entrances()
  if (type === TerritoryKindKey.Phone) {
    unit = m.territory_doc_unit_phones()
  }
  if (type === TerritoryKindKey.Classical || type === TerritoryKindKey.Univ) {
    unit = m.territory_doc_unit_homes()
  }

  let quantity = entrances.length
  if (type === TerritoryKindKey.Phone) {
    quantity = entrances.reduce((acc, entrance) => acc + (entrance.phones ?? 0), 0)
  }
  if (type === TerritoryKindKey.Classical || type === TerritoryKindKey.Univ) {
    quantity = entrances.reduce((acc, entrance) => acc + ((entrance.homes ?? 0) || (entrance.phones ?? 0)), 0)
  }

  const firstBuilding = entrances[0]?.buildings[0]
  const marker =
    firstBuilding?.latitude != null && firstBuilding.longitude != null
      ? { lat: firstBuilding.latitude, lng: firstBuilding.longitude }
      : null
  const hasPerimeterFallback = perimeter != null && perimeter.length >= 3
  const showMapPage =
    googleMapKey != null && googleMapKey.length > 0 && (marker != null || overlays.length > 0 || hasPerimeterFallback)

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
            if (type === TerritoryKindKey.Commerces) {
              return <CommerceInformations key={entrance.id} entrance={entrance} />
            }

            return <EntranceInformations key={entrance.id} entrance={entrance} canShowPhone={showPhone} />
          })}
        </View>
        <View style={styles.footer}>
          <Text style={styles.alt}>
            {m.territory_doc_checked_out_by()} {owner ?? '........................'}
          </Text>
          <Text style={styles.alt}>
            {m.territory_doc_return_by()} {restitutionDate?.toLocaleDateString('fr') ?? '..................'}
          </Text>
        </View>
        <DocumentWaterMark type={attributionType} isCampaign={attributionCampaign} />
      </Page>
      {showMapPage && googleMapKey != null && (
        <Page size={{ width: 270, height: 425 }} style={styles.map}>
          <Image
            src={buildTerritoryStaticMapUrl({
              apiKey: googleMapKey,
              mapId: googleMapId,
              size: '300x450',
              scale: 2,
              marker,
              overlays,
              perimeter,
            })}
          />
          <View style={styles.footerMap}>
            <Image src={path.join(publicDir, 'marker-google.jpg')} style={{ height: 20 }} />
            <Text>{m.territory_doc_map_position()}</Text>
          </View>
        </Page>
      )}
    </Document>
  )
}

function DocumentWaterMark({ type, isCampaign }: { type: TerritoryAttributionKind; isCampaign: boolean }) {
  if (isCampaign) {
    return <Text style={styles.watermark}>{m.territory_doc_watermark_campaign()}</Text>
  }

  if (type === TerritoryAttributionKind.Phone) {
    return (
      <Text style={[styles.watermark, { color: '#0f766e', left: '10%' }]}>{m.territory_doc_watermark_phones()}</Text>
    )
  }

  return null
}

function TypeInformations({ type }: { type: TerritoryKindKey }) {
  return (
    <Text style={styles.type}>
      {type === TerritoryKindKey.Phone && m.territories_type_phone_singular()}
      {type === TerritoryKindKey.Univ && m.territories_type_university_singular()}
      {type === TerritoryKindKey.Commerces && m.territory_doc_type_commerce()}
      {type === TerritoryKindKey.Hotel && m.territories_type_hotel_singular()}
    </Text>
  )
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
        {canShowPhone && phones > 0 && m.territory_doc_phone_abbr({ count: phones })}
      </Text>
      {entrance.notes.length > 0 && <Text style={styles.alert}>{entrance.notes}</Text>}
    </View>
  )
}

function CommerceInformations({ entrance }: { entrance: Entrance }) {
  const firstBuilding = entrance.buildings[0]
  const numbers = entrance.buildings.map(building => building.number).join(', ')

  const shopLabel = getShopKindLabels()[entrance.shopKind as ShopKind] ?? m.territory_doc_shop_fallback()

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
