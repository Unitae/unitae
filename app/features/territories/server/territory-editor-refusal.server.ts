import * as m from '~/i18n/paraglide/messages'
import { ConflictError } from '~/shared/errors/app-error.server'

import { EntranceTakenError, type TakenEntrance } from './territory-entrances.server'

export type EditorRefusal =
  | { kind: 'number-taken'; message: string }
  | { kind: 'entrance-taken'; message: string; entrances: TakenEntrance[] }

/**
 * What the territory editor says when a save is refused: the number belongs to another territory, or entrances were
 * put on another territory of the type in the meantime. Anything else is not a refusal (null): the caller rethrows it.
 * Catch the error outside the transaction, so that nothing written before the refusal stays.
 */
export function editorRefusal(error: unknown, number: string): EditorRefusal | null {
  if (error instanceof EntranceTakenError) {
    const [first] = error.entrances
    const message =
      error.entrances.length === 1 && first != null
        ? m.territory_editor_entrance_taken({ address: first.address, territory: first.territoryNumber })
        : m.territory_editor_entrance_taken_plural({
            count: error.entrances.length,
            list: error.entrances.map(entrance => `${entrance.address} (${entrance.territoryNumber})`).join(', '),
          })
    return { kind: 'entrance-taken', message, entrances: error.entrances }
  }
  if (error instanceof ConflictError && error.message === 'territory_number_taken') {
    return { kind: 'number-taken', message: m.territory_editor_number_taken({ number }) }
  }
  return null
}
