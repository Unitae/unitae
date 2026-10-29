import { describe, expect, it } from 'vitest'
import { lineCount, runsWidth, type TextMeasurer, widestWord, wrapLines } from './sheet-text'

// Every character half a point wide at 1pt, bold ones a whole point: easy to count by hand.
const measurer: TextMeasurer = {
  width: (text, weight) => text.length * (weight === 'bold' ? 1 : 0.5),
  baseline: 0.9,
}

describe('wrapLines', () => {
  it('keeps a line whole when it fits', () => {
    expect(wrapLines([{ text: 'Jean Dupont', weight: 'regular' }], measurer, 10, 100)).toEqual([
      { text: 'Jean Dupont', width: 55 },
    ])
  })

  it('breaks between words, never inside one', () => {
    // « Jean » is 20pt, the space 5pt, « Dupont » 30pt: they need 55pt.
    expect(wrapLines([{ text: 'Jean Dupont', weight: 'regular' }], measurer, 10, 50)).toEqual([
      { text: 'Jean', width: 20 },
      { text: 'Dupont', width: 30 },
    ])
  })

  it('keeps words glued by a no-break space on one line', () => {
    const lines = wrapLines([{ text: 'discernement » 10 min', weight: 'regular' }], measurer, 10, 40)

    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('discernement » 10 min')
  })

  it('measures each run in its own weight', () => {
    const runs = [
      { text: 'Jean', weight: 'regular' as const },
      { text: 'DUPONT', weight: 'bold' as const },
    ]
    // 20pt + a 5pt space + 60pt.
    expect(wrapLines(runs, measurer, 10, 200)).toEqual([{ text: 'Jean DUPONT', width: 85 }])
    expect(lineCount(runs, measurer, 10, 70)).toBe(2)
  })
})

describe('widestWord', () => {
  it('finds the word that would spill out of a narrow column', () => {
    expect(widestWord([{ text: 'Monique DE LA FONTAINE-BEAUREGARD', weight: 'regular' }], measurer, 10)).toBe(95)
  })
})

describe('runsWidth', () => {
  it('adds the runs up on one line', () => {
    expect(
      runsWidth(
        [
          { text: 'Jean ', weight: 'regular' },
          { text: 'DUPONT', weight: 'bold' },
        ],
        measurer,
        10,
      ),
    ).toBe(85)
  })
})
