// A share message is the SMS/WhatsApp text a programme manager sends to the
// person they just assigned. The body lives on the preset (the "kind" of the
// part) and is written with {{variable}} placeholders; this module turns one
// into finished text. Pure and client-safe on purpose — the preset editor
// renders a live preview with it, and the share button reuses the very same
// function server-side, so what the manager previews is what gets sent.

// Every placeholder a preset body may use. Adding one here is what makes it
// legal in `findUnknownVariables`, so the editor rejects typos at save time
// instead of silently sending a blank where a name should be.
export const SHARE_VARIABLES = [
  'assignee',
  'assigneeFirstname',
  'assistant',
  'partName',
  'section',
  'topic',
  'duration',
  'date',
  'time',
  'eventName',
  'note',
  'congregation',
  'link',
] as const

export type ShareVariable = (typeof SHARE_VARIABLES)[number]

// Every slot is nullable because most of them genuinely are: a part with no
// reader has no assistant, an unfilled topic is empty, a congregation with no
// programme tile has no link. Emptiness drives the line-dropping below.
export type ShareMessageContext = Record<ShareVariable, string | null>

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g

// Trailing punctuation a vanished variable leaves stranded — "Sujet :" with
// nothing after it. Stripped per line, after substitution.
const DANGLING_SEPARATOR = /[\s]*[:\-–—,;]+\s*$/

function isBlank(value: string | null): boolean {
  return value == null || value.trim() === ''
}

export function findUnknownVariables(body: string): string[] {
  const unknown: string[] = []

  for (const match of body.matchAll(PLACEHOLDER)) {
    const name = match[1]
    if (SHARE_VARIABLES.some(v => v === name)) continue
    if (unknown.includes(name)) continue
    unknown.push(name)
  }

  return unknown
}

// Renders one line, reporting whether it still carries information.
//
// The rule: a line that contains placeholders and whose placeholders ALL came
// out empty is dropped entirely. "Sujet : {{topic}}" disappears when there is
// no topic, rather than shipping a bare label. A line keeping at least one
// real value survives — "{{partName}} — {{topic}}" degrades to just the part
// name — with any separator the empty slot orphaned trimmed off the end.
//
// Checking ALL rather than ANY is deliberate: ANY would throw away the part
// name too, losing information the recipient needs.
function renderLine(line: string, context: ShareMessageContext): string | null {
  let total = 0
  let filled = 0
  let removed = false

  const substituted = line.replace(PLACEHOLDER, (_match, name: string) => {
    // Unknown placeholders render empty but are deliberately NOT counted
    // toward the drop rule. They mean the body is buggy (a typo, or a variable
    // we later retired), and letting them drive the rule would silently delete
    // the line's literal text along with them. Better to lose the placeholder
    // and keep the sentence, so the defect stays visible.
    if (!SHARE_VARIABLES.some(v => v === name)) {
      removed = true
      return ''
    }

    total += 1
    const value = context[name as ShareVariable]
    if (isBlank(value)) {
      removed = true
      return ''
    }
    filled += 1
    // biome-ignore lint/style/noNonNullAssertion: isBlank already rejected null
    return value!.trim()
  })

  if (total > 0 && filled === 0) return null
  if (!removed) return substituted

  // Something vanished mid-line: tidy up after it. Strip a separator it left
  // stranded at the end, then close the gap it opened between two words.
  return substituted.replace(DANGLING_SEPARATOR, '').replace(/[ \t]{2,}/g, ' ')
}

export function renderShareMessage(body: string, context: ShareMessageContext): string {
  return body
    .split('\n')
    .map(line => renderLine(line, context))
    .filter(line => line !== null)
    .join('\n')
    .trim()
}
