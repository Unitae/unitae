import { getLocale } from '~/i18n/paraglide/runtime'

const EXTENSION = /\.[a-z0-9]{1,5}$/i
const SEPARATORS = /[_\s-]+/g

/** A title to start from, out of an uploaded file's name: « lettre_avril.pdf » gives « Lettre avril ». */
export function titleFromFileName(fileName: string): string {
  const words = fileName.replace(EXTENSION, '').replace(SEPARATORS, ' ').trim()
  return words.charAt(0).toLocaleUpperCase(getLocale()) + words.slice(1)
}
