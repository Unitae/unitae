import { useState } from 'react'
import { useFetcher } from 'react-router'
import { idsAfterGroupMove, idsAfterTopMove, type ListedPart } from '~/features/settings/model/schedule-template-list'
import * as m from '~/i18n/paraglide/messages'
import type { OrderControls } from './TemplateOrder'

/** The ids an order sends; null for anything else. */
function readIds(value: FormDataEntryValue | null | undefined): number[] | null {
  if (value == null) return null
  try {
    const parsed: unknown = JSON.parse(String(value))
    return Array.isArray(parsed) && parsed.every(Number.isInteger) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Moving a programme template's parts and sections (design round A): dragged on a wide screen, up and down on a phone
 * while « Réorganiser les parties » is on. Each move saves at once, and the list shows the new order while it does;
 * an up or down move is said (« « Lecture de la Bible » montée d'une place. »), a drag announces itself. A refused
 * order (the list changed meanwhile) says why, and the page reads the list again.
 */
export function useTemplateReorder<P extends ListedPart>({
  templateId,
  parts,
  enabled,
  docked,
}: {
  templateId: number
  parts: P[]
  /** A programme template a kind uses: a duties one's services keep their order here. */
  enabled: boolean
  docked: boolean
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: Record<string, string[] | null> }>({
    key: `schedule-template-${templateId}-order`,
  })
  const [reordering, setReordering] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const pending = readIds(fetcher.formData?.get('orderedIds'))
  const shown =
    pending == null
      ? parts
      : [...parts].sort((a, b) => {
          const at = (part: P) => (pending.includes(part.id) ? pending.indexOf(part.id) : pending.length)
          return at(a) - at(b)
        })
  const refusal =
    fetcher.state === 'idle' && fetcher.data != null && fetcher.data.ok !== true
      ? Object.values(fetcher.data.error ?? {})
          .flatMap(messages => messages ?? [])
          .join(' ')
      : ''

  const save = (ids: number[] | null, said: string) => {
    if (ids == null) return
    fetcher.submit({ intent: 'reorder-parts', orderedIds: JSON.stringify(ids) }, { method: 'post' })
    setAnnouncement(said)
  }
  const told = (from: number, to: number, name: string) =>
    !docked
      ? to < from
        ? m.settings_schedule_templates_moved_up({ name })
        : m.settings_schedule_templates_moved_down({ name })
      : ''
  const moves = {
    top: (from: number, to: number, name: string) => save(idsAfterTopMove(shown, from, to), told(from, to, name)),
    group: (partId: number, from: number, to: number, name: string) =>
      save(idsAfterGroupMove(shown, partId, to), told(from, to, name)),
  }
  const controls: OrderControls | null = !enabled
    ? null
    : docked
      ? { mode: 'drag', ...moves }
      : reordering
        ? { mode: 'buttons', ...moves }
        : null

  return {
    parts: shown,
    controls,
    announcement,
    refusal,
    /** « Réorganiser les parties » / « Terminé », on a phone only. */
    toggle: enabled && !docked ? () => setReordering(current => !current) : undefined,
  }
}
