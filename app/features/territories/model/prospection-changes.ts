import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { fieldChanged, valuesOf } from '~/shared/utils/form-changes'

const RESIDENTIAL_FIELDS = ['access', 'homes', 'phones', 'liberals', 'pmr', 'residential-notes'] as const
// Shown only with a digicode: they count as changes only while the digicode stays.
const DIGICODE_FIELDS = ['doors', 'mailboxes'] as const
const DIGICODE = String(TerritoryAccess.Code)
const UNIQUE_ENTRANCE_FIELDS = ['hotel', 'campus', 'landromat'] as const

function sharedBuildings(data: FormData): string {
  return (valuesOf(data, 'shared-entrance-buildings')[0] ?? '').split(',').filter(Boolean).sort().join(',')
}

function shops(data: FormData): Map<string, { kind: string; notes: string }> {
  const kinds = valuesOf(data, 'shopkinds')
  const notes = valuesOf(data, 'commerce-notes')
  return new Map(
    valuesOf(data, 'commerce-key').map((key, index) => [key, { kind: kinds[index] ?? '', notes: notes[index] ?? '' }]),
  )
}

/**
 * How many changes the building prospection form holds, the way a person would count them: an entrance added or
 * removed is one change, whatever fields come with it; inside a kept entrance, each changed field is one.
 */
export function countProspectionChanges(before: FormData, after: FormData): number {
  let count = fieldChanged(before, after, 'prospection-date') ? 1 : 0

  const hadResidential = before.has('has-residential')
  if (hadResidential !== after.has('has-residential')) {
    count += 1
  } else if (hadResidential) {
    count += RESIDENTIAL_FIELDS.filter(name => fieldChanged(before, after, name)).length
    if (before.get('access') === DIGICODE && after.get('access') === DIGICODE) {
      count += DIGICODE_FIELDS.filter(name => fieldChanged(before, after, name)).length
    }
    if (sharedBuildings(before) !== sharedBuildings(after)) count += 1
  }

  count += UNIQUE_ENTRANCE_FIELDS.filter(name => before.has(name) !== after.has(name)).length

  const beforeShops = shops(before)
  const afterShops = shops(after)
  for (const [key, shop] of afterShops) {
    const previous = beforeShops.get(key)
    if (previous == null) count += 1
    else count += Number(previous.kind !== shop.kind) + Number(previous.notes !== shop.notes)
  }
  count += [...beforeShops.keys()].filter(key => !afterShops.has(key)).length

  return count
}
