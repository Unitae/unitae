import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The typography every message is written in, in both languages: the typographic apostrophe « ’ » and the ellipsis
// « … ». A straight « ' » or three dots read as typed in a hurry beside the hundreds that are right.
const STRAIGHT_APOSTROPHE = /'/
const THREE_DOTS = /\.\.\./

function readMessages(locale: string): [string, string][] {
  const url = new URL(`./messages/${locale}.json`, import.meta.url)
  const messages: Record<string, string> = JSON.parse(readFileSync(url, 'utf8'))
  return Object.entries(messages).filter(([key]) => key !== '$schema')
}

describe.each(['fr', 'en'])('the %s messages', locale => {
  const messages = readMessages(locale)

  it('use the typographic apostrophe « ’ », never a straight one', () => {
    expect(messages.filter(([, text]) => STRAIGHT_APOSTROPHE.test(text)).map(([key]) => key)).toEqual([])
  })

  it('use the ellipsis « … », never three dots', () => {
    expect(messages.filter(([, text]) => THREE_DOTS.test(text)).map(([key]) => key)).toEqual([])
  })
})
