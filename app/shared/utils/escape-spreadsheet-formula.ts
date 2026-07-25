const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

/**
 * Prevent CSV/XLSX formula injection: a cell value that begins with a
 * formula-trigger character can be executed as a formula by spreadsheet software
 * when the file is opened. Prefix such values with a single quote so they stay
 * literal text.
 * https://owasp.org/www-community/attacks/CSV_Injection
 */
export function escapeSpreadsheetFormula(value: string): string {
  return value.length > 0 && FORMULA_TRIGGERS.has(value[0]) ? `'${value}` : value
}
