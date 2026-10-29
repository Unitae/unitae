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
import { Card, CardContent } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { BOARD_WEB_FONT_STACK } from './board-web-fonts'
import { LayoutSchematic } from './LayoutSchematic'

// The appearance card of a dynamic document's edit page: a typeface, an accent and a layout, each
// picked from the curated lists. The radio groups submit with the form as `appearance.*`.

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
  'flex cursor-pointer flex-col items-start gap-2 rounded-md border p-3 font-normal transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {hint && <p className="text-muted-foreground -mt-1 text-xs">{hint}</p>}
      {children}
    </fieldset>
  )
}

export function AppearanceFields({
  dynamicType,
  appearance,
  onChange,
}: {
  dynamicType: DynamicType
  appearance: BoardAppearance
  onChange: () => void
}) {
  const layouts: readonly BoardLayout[] = BOARD_LAYOUTS[dynamicType]

  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{m.board_appearance_title()}</h3>
          <p className="text-muted-foreground text-sm">{m.board_appearance_description()}</p>
        </div>

        <Field label={m.board_appearance_typeface_label()}>
          <RadioGroup
            name="appearance.typeface"
            defaultValue={appearance.typeface}
            onValueChange={onChange}
            className="grid gap-3 sm:grid-cols-3"
          >
            {BOARD_TYPEFACES.map(typeface => (
              <Label key={typeface} htmlFor={`appearance-typeface-${typeface}`} className={OPTION}>
                <span className="flex items-center gap-2">
                  <RadioGroupItem value={typeface} id={`appearance-typeface-${typeface}`} />
                  <span className="text-sm font-medium">{TYPEFACE_NAMES[typeface]}</span>
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
            defaultValue={appearance.accent}
            onValueChange={onChange}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          >
            {BOARD_ACCENTS.map(accent => (
              <Label
                key={accent}
                htmlFor={`appearance-accent-${accent}`}
                className={`${OPTION} flex-row items-center py-2`}
              >
                <RadioGroupItem value={accent} id={`appearance-accent-${accent}`} />
                <span
                  className="ring-border size-4 shrink-0 rounded-full ring-1"
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
              defaultValue={appearance.layout}
              onValueChange={onChange}
              className="grid gap-3 sm:grid-cols-3"
            >
              {layouts.map(layout => {
                const [label, hint] = LAYOUT_TEXT[`${dynamicType}:${layout}`] ?? [() => layout, () => '']
                return (
                  <Label key={layout} htmlFor={`appearance-layout-${layout}`} className={OPTION}>
                    <span className="flex items-center gap-2">
                      <RadioGroupItem value={layout} id={`appearance-layout-${layout}`} />
                      <span className="text-sm font-medium">{label()}</span>
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
      </CardContent>
    </Card>
  )
}
