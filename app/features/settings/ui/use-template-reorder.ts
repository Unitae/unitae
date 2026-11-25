import { useEffect, useRef, useState } from 'react'
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
  const fetcher = useFetcher<{ ok?: boolean; errors?: string[]; error?: Record<string, string[] | null> }>({
    key: `schedule-template-${templateId}-order`,
  })
  const [reordering, setReordering] = useState(false)
  // What the page says, with a count so the same words said twice are read twice.
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 })
  const say = (text: string) => setAnnouncement(current => ({ text, count: current.count + 1 }))
  // A move is said once it is saved; refused, the refusal is said instead.
  const pendingSaid = useRef('')
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
      ? [
          ...(fetcher.data.errors ?? []),
          ...Object.values(fetcher.data.error ?? {}).flatMap(messages => messages ?? []),
        ].join(' ')
      : ''
  const seen = useRef(fetcher.data)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each new answer
  useEffect(() => {
    if (fetcher.state !== 'idle' || fetcher.data === seen.current) return
    seen.current = fetcher.data
    const said = fetcher.data?.ok === true ? pendingSaid.current : refusal
    pendingSaid.current = ''
    if (said !== '') say(said)
  }, [fetcher.state, fetcher.data])

  const save = (ids: number[] | null, said: string) => {
    if (ids == null) return
    pendingSaid.current = said
    fetcher.submit({ intent: 'reorder-parts', orderedIds: JSON.stringify(ids) }, { method: 'post' })
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
    // A no-break space every other time: the same words said again are a change the reader hears.
    announcement: announcement.count % 2 === 0 ? announcement.text : `${announcement.text}\u00a0`,
    refusal,
    /** « Réorganiser les parties » / « Terminé », on a phone only. */
    toggle: enabled && !docked ? () => setReordering(current => !current) : undefined,
  }
}
