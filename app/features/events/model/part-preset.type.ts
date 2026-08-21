// The kinds of programme part a congregation can assign. Seeded per
// congregation as PartPreset rows, so these keys identify the *system* presets
// — a congregation may add its own kinds alongside them, which is why the key
// is a plain string on the row rather than an enum column.
//
// Unlike EventTemplateKey, there is no isSystemPreset(key) companion: PartPreset
// carries an `isSystem` boolean, and that column is the single source of truth.
// A key-membership helper would drift the moment someone creates a custom preset
// whose key happens to collide.
export enum PartPresetKey {
  Prayer = 'prayer',
  Chairman = 'chairman',
  SpiritualGems = 'spiritual-gems',
  SpiritualPearls = 'spiritual-pearls',
  BibleReading = 'bible-reading',
  SchoolDemonstration = 'school-demonstration',
  SchoolTalk = 'school-talk',
  ChristianLifeTalk = 'christian-life-talk',
  PublicTalk = 'public-talk',
  WatchtowerStudy = 'watchtower-study',
  CongregationBibleStudy = 'congregation-bible-study',
}

// Which family of assignment a preset applies to. Only 'part' is used today;
// service presets are a later wave, and the column exists so adding them needs
// no migration.
export const PartPresetScope = {
  Part: 'part',
  Service: 'service',
} as const

export type PartPresetScope = (typeof PartPresetScope)[keyof typeof PartPresetScope]
