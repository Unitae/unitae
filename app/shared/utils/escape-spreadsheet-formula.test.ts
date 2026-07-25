import { describe, expect, it } from 'vitest'
import { escapeSpreadsheetFormula } from './escape-spreadsheet-formula'

describe('escapeSpreadsheetFormula', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])('prefixes a value starting with the trigger char %j', trigger => {
    const value = `${trigger}SUM(A1:A2)`
    expect(escapeSpreadsheetFormula(value)).toBe(`'${value}`)
  })

  it('leaves a normal value unchanged', () => {
    expect(escapeSpreadsheetFormula('Jean Dupont')).toBe('Jean Dupont')
  })

  it('leaves an empty string unchanged', () => {
    expect(escapeSpreadsheetFormula('')).toBe('')
  })

  it('only inspects the first character', () => {
    expect(escapeSpreadsheetFormula('A=B')).toBe('A=B')
    expect(escapeSpreadsheetFormula('=A')).toBe("'=A")
  })
})
