// How the board's printable sheets measure text before react-pdf sets it. They choose their text
// size and split their columns from these measures, so the measures follow react-pdf's own rules:
// lines break between words only, and a no-break space glues its neighbours together.

export type TextWeight = 'regular' | 'bold'

/** A stretch of text set in one weight; a line of a sheet is one or more runs. */
export interface TextRun {
  text: string
  weight: TextWeight
}

/**
 * Widths in one typeface, read from the very font files react-pdf sets the sheet in. The server
 * provides it; everything here stays pure so it can be tested with a fixed-width stand-in.
 */
export interface TextMeasurer {
  /** The width of `text` set at 1pt, in points. */
  width(text: string, weight: TextWeight): number
  /** How far below the top of its line react-pdf sets the baseline, at 1pt. */
  baseline: number
}

// Lines break at plain spaces only: a no-break space glues its neighbours, as in react-pdf.
const BREAKS = /[ \t\n]+/

function words(run: TextRun): string[] {
  return run.text.split(BREAKS).filter(Boolean)
}

/** The width of these runs set on one line. */
export function runsWidth(runs: TextRun[], measurer: TextMeasurer, size: number): number {
  return runs.reduce((total, run) => total + measurer.width(run.text, run.weight) * size, 0)
}

export interface WrappedLine {
  text: string
  width: number
}

/** The lines these runs take in `width`, breaking between words only, as react-pdf does. */
export function wrapLines(runs: TextRun[], measurer: TextMeasurer, size: number, width: number): WrappedLine[] {
  const space = measurer.width(' ', 'regular') * size
  const lines: WrappedLine[] = []
  let current: string[] = []
  let x = 0
  for (const run of runs) {
    for (const word of words(run)) {
      const wordWidth = measurer.width(word, run.weight) * size
      if (x > 0 && x + space + wordWidth > width) {
        lines.push({ text: current.join(' '), width: x })
        current = [word]
        x = wordWidth
      } else {
        current.push(word)
        x += (x > 0 ? space : 0) + wordWidth
      }
    }
  }
  return [...lines, { text: current.join(' '), width: x }]
}

export function lineCount(runs: TextRun[], measurer: TextMeasurer, size: number, width: number): number {
  return wrapLines(runs, measurer, size, width).length
}

/** The widest single word of these runs: wider than its column, it would spill into the next. */
export function widestWord(runs: TextRun[], measurer: TextMeasurer, size: number): number {
  return Math.max(0, ...runs.flatMap(run => words(run).map(word => measurer.width(word, run.weight) * size)))
}
