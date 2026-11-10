/** Why a searched place could not sort a list: it was not found, or `@` came without one. */
export type GeocodeNoticeData = { kind: 'failed'; query: string } | { kind: 'missing-query' }
