import { z } from 'zod'
import {
  BOARD_ACCENTS,
  BOARD_LAYOUTS,
  BOARD_TYPEFACES,
  type BoardAppearance,
  defaultAppearance,
  isBoardLayout,
} from '~/features/display-board/model/board-appearance'
import type { DynamicType } from '~/features/display-board/model/dynamic-document.type'

// A document's appearance as the edit form sends it and as it is stored: three choices from the
// curated lists, never a free value. The layout is checked against the document's own type when
// it is applied, since the form only knows the union of every layout.

const ALL_LAYOUTS = [...new Set(Object.values(BOARD_LAYOUTS).flat())] as [string, ...string[]]

const typefaceSchema = z.enum(BOARD_TYPEFACES)
const accentSchema = z.enum(BOARD_ACCENTS)

export const appearanceInputSchema = z.object({
  typeface: typefaceSchema,
  accent: accentSchema,
  layout: z.enum(ALL_LAYOUTS),
})

export type AppearanceInput = z.infer<typeof appearanceInputSchema>

/** What to store for a document of this type: a layout it doesn't offer becomes its default. */
export function appearanceFor<T extends DynamicType>(type: T, input: AppearanceInput): BoardAppearance<T> {
  return {
    typeface: input.typeface,
    accent: input.accent,
    layout: isBoardLayout(type, input.layout) ? input.layout : defaultAppearance(type).layout,
  }
}

/**
 * A stored appearance, read leniently: nothing stored means the defaults, and a choice that no
 * longer reads — a layout since withdrawn, a hand-edited archive — falls back to its own default
 * while the others keep their value.
 */
export function parseAppearance<T extends DynamicType>(type: T, raw: unknown): BoardAppearance<T> {
  const stored = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const fallback = defaultAppearance(type)
  return {
    typeface: typefaceSchema.safeParse(stored.typeface).data ?? fallback.typeface,
    accent: accentSchema.safeParse(stored.accent).data ?? fallback.accent,
    layout: isBoardLayout(type, stored.layout) ? stored.layout : fallback.layout,
  }
}
