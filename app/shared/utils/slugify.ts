// Turns a name into a lowercase ASCII slug: a subdomain for a new congregation, a key for a
// part preset. Latin accents are stripped; Ukrainian and Russian are transliterated, since a
// congregation named in Cyrillic would otherwise get an empty slug.

// `letters('а=a б=b')` reads a transliteration table. Biome wants ASCII property names, so the
// Cyrillic keys live in a string instead of an object literal.
function letters(table: string): Map<string, string> {
  return new Map(table.split(' ').map(pair => pair.split('=') as [string, string]))
}

// Letters spelled the same way in both languages.
const COMMON = letters(
  'а=a б=b в=v д=d е=e ж=zh з=z к=k л=l м=m н=n о=o п=p р=r с=s т=t у=u ф=f х=kh ц=ts ч=ch ш=sh щ=shch ь= ъ=',
)

// Ukrainian national romanisation (2010): a few letters change at the start of a word.
const UKRAINIAN = letters('г=h ґ=g и=y і=i й=i ї=i є=ie ю=iu я=ia')
const UKRAINIAN_INITIAL = letters('й=y ї=yi є=ye ю=yu я=ya')

const RUSSIAN = letters('г=g и=i й=y ы=y э=e ё=yo ю=yu я=ya')

// і, ї, є and ґ exist only in Ukrainian: they settle how to read Г when no locale is given.
const UKRAINIAN_ONLY = /[іїєґ]/i
const APOSTROPHES = /['’ʼ`]/g
const LETTER = /\p{L}/u

function transliterate(text: string, ukrainian: boolean): string {
  const table = ukrainian ? UKRAINIAN : RUSSIAN
  let result = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const atWordStart = index === 0 || !LETTER.test(text[index - 1])
    const initial = ukrainian && atWordStart ? UKRAINIAN_INITIAL.get(char) : undefined
    result += initial ?? table.get(char) ?? COMMON.get(char) ?? char
  }
  return result
}

export function slugify(text: string, locale?: string): string {
  const lower = text.normalize('NFC').toLowerCase().replace(APOSTROPHES, '')
  const ukrainian = locale === 'uk' || (locale !== 'ru' && UKRAINIAN_ONLY.test(lower))
  return transliterate(lower, ukrainian)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
