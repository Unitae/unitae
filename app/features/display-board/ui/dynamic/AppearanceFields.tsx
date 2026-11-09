import {
  BOARD_ACCENT_COLOR,
  BOARD_ACCENTS,
  BOARD_LAYOUTS,
  BOARD_TYPEFACES,
  type BoardAccent,
  type BoardAppearance,
  type BoardLayout,
  type BoardTypeface,
} from '~/features/display-board/model/board-appearance'
import type { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { BOARD_WEB_FONT_STACK } from './board-web-fonts'
import { LayoutSchematic } from './LayoutSchematic'

const TYPEFACE_NAMES: Record<BoardTypeface, string> = {
  fira: 'Fira Sans',
  atkinson: 'Atkinson Hyperlegible',
  serif: 'Source Serif',
}

const TYPEFACE_HINTS: Record<BoardTypeface, () => string> = {
  fira: m.board_appearance_typeface_fira_hint,
  atkinson: m.board_appearance_typeface_atkinson_hint,
  serif: m.board_appearance_typeface_serif_hint,
}

const ACCENT_LABELS: Record<BoardAccent, () => string> = {
  teal: m.board_appearance_accent_teal,
  blue: m.board_appearance_accent_blue,
  indigo: m.board_appearance_accent_indigo,
  plum: m.board_appearance_accent_plum,
  wine: m.board_appearance_accent_wine,
  brick: m.board_appearance_accent_brick,
  olive: m.board_appearance_accent_olive,
  slate: m.board_appearance_accent_slate,
  black: m.board_appearance_accent_black,
}

const LAYOUT_TEXT: Partial<Record<`${DynamicType}:${BoardLayout}`, [() => string, () => string]>> = {
  'publisher-groups:directory': [
    m.board_appearance_layout_groups_directory,
    m.board_appearance_layout_groups_directory_hint,
  ],
  'publisher-groups:columns': [m.board_appearance_layout_groups_columns, m.board_appearance_layout_groups_columns_hint],
  'publisher-groups:bands': [m.board_appearance_layout_groups_bands, m.board_appearance_layout_groups_bands_hint],
  'organigram:leader': [m.board_appearance_layout_organigram_leader, m.board_appearance_layout_organigram_leader_hint],
  'organigram:chart': [m.board_appearance_layout_organigram_chart, m.board_appearance_layout_organigram_chart_hint],
  'pioneers:sections': [m.board_appearance_layout_pioneers_sections, m.board_appearance_layout_pioneers_sections_hint],
  'pioneers:columns': [m.board_appearance_layout_pioneers_columns, m.board_appearance_layout_pioneers_columns_hint],
}

// An option is a card; the chosen one takes the primary colour's border.
const OPTION =
  'flex cursor-pointer flex-col items-start gap-2 rounded-md border border-border p-3 font-normal transition-colors hover:bg-hover has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="col-span-full flex min-w-0 flex-col gap-2">
      <legend className="mb-2 font-medium text-sm">{label}</legend>
      {hint && <p className="-mt-1 text-muted-foreground text-sm">{hint}</p>}
      {children}
    </fieldset>
  )
}

interface AppearanceFieldsProps {
  dynamicType: DynamicType
  value: BoardAppearance
  /** Each choice as it is made, so the preview beside the form follows it. */
  onChange: (next: BoardAppearance) => void
}

/**
 * A dynamic document's typeface, accent and layout, each picked from the curated lists, as fields of
 * its form's « Apparence » section. The radio groups submit as `appearance.*`.
 */
export function AppearanceFields({ dynamicType, value, onChange }: AppearanceFieldsProps) {
  const layouts: readonly BoardLayout[] = BOARD_LAYOUTS[dynamicType]
  const set = (patch: Partial<BoardAppearance>) => onChange({ ...value, ...patch })

  return (
    <>
      <Field label={m.board_appearance_typeface_label()}>
        <RadioGroup
          name="appearance.typeface"
          value={value.typeface}
          onValueChange={typeface => set({ typeface: typeface as BoardTypeface })}
          className="grid gap-3 sm:grid-cols-3"
        >
          {BOARD_TYPEFACES.map(typeface => (
            <Label key={typeface} htmlFor={`appearance-typeface-${typeface}`} className={OPTION}>
              <span className="flex items-center gap-2">
                <RadioGroupItem value={typeface} id={`appearance-typeface-${typeface}`} />
                <span className="font-medium text-sm">{TYPEFACE_NAMES[typeface]}</span>
              </span>
              <span className="text-lg" style={{ fontFamily: BOARD_WEB_FONT_STACK[typeface] }}>
                <span className="text-muted-foreground">Jean </span>
                <span className="font-bold">DUPONT</span>
              </span>
              <span className="text-muted-foreground text-xs">{TYPEFACE_HINTS[typeface]()}</span>
            </Label>
          ))}
        </RadioGroup>
      </Field>

      <Field label={m.board_appearance_accent_label()} hint={m.board_appearance_accent_hint()}>
        <RadioGroup
          name="appearance.accent"
          value={value.accent}
          onValueChange={accent => set({ accent: accent as BoardAccent })}
          className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2"
        >
          {BOARD_ACCENTS.map(accent => (
            <Label
              key={accent}
              htmlFor={`appearance-accent-${accent}`}
              className={`${OPTION} flex-row items-center py-2`}
            >
              <RadioGroupItem value={accent} id={`appearance-accent-${accent}`} />
              <span
                className="size-4 shrink-0 rounded-full ring-1 ring-border"
                style={{ backgroundColor: BOARD_ACCENT_COLOR[accent] }}
              />
              <span className="text-sm">{ACCENT_LABELS[accent]()}</span>
            </Label>
          ))}
        </RadioGroup>
      </Field>

      {/* The programme has a single layout: nothing to choose, but it still submits. */}
      {layouts.length > 1 ? (
        <Field label={m.board_appearance_layout_label()}>
          <RadioGroup
            name="appearance.layout"
            value={value.layout}
            onValueChange={layout => set({ layout: layout as BoardLayout })}
            className="grid gap-3 sm:grid-cols-3"
          >
            {layouts.map(layout => {
              const [label, hint] = LAYOUT_TEXT[`${dynamicType}:${layout}`] ?? [() => layout, () => '']
              return (
                <Label key={layout} htmlFor={`appearance-layout-${layout}`} className={OPTION}>
                  <span className="flex items-center gap-2">
                    <RadioGroupItem value={layout} id={`appearance-layout-${layout}`} />
                    <span className="font-medium text-sm">{label()}</span>
                  </span>
                  <span className="text-foreground/70">
                    <LayoutSchematic type={dynamicType} layout={layout} />
                  </span>
                  <span className="text-muted-foreground text-xs">{hint()}</span>
                </Label>
              )
            })}
          </RadioGroup>
        </Field>
      ) : (
        <input type="hidden" name="appearance.layout" value={layouts[0]} />
      )}
    </>
  )
}
