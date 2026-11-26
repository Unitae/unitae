import { BookOpen, Gem, HeartHandshake, type LucideIcon } from 'lucide-react'

// Official workbook section identity (colors come from the section tokens in
// tailwind.css). Matching is by keyword so custom section wordings still map:
// "Joyaux de la parole de Dieu", "Appliquons-nous au ministère",
// "Vie chrétienne".

const SECTION_COLOR_MAP: [string, string][] = [
  ['joyaux', 'var(--color-section-treasures)'],
  ['minist', 'var(--color-section-ministry)'],
  ['chr', 'var(--color-section-living)'],
]

const SECTION_ICONS: [string, LucideIcon][] = [
  ['joyaux', Gem],
  ['minist', BookOpen],
  ['chr', HeartHandshake],
]

export function sectionColor(section: string): string {
  const lower = section.toLowerCase()
  for (const [pattern, cssVar] of SECTION_COLOR_MAP) {
    if (lower.includes(pattern)) return cssVar
  }
  return 'var(--color-muted-foreground)'
}

export function sectionIcon(section: string): LucideIcon | undefined {
  const lower = section.toLowerCase()
  for (const [pattern, icon] of SECTION_ICONS) {
    if (lower.includes(pattern)) return icon
  }
  return undefined
}
