import type { FetcherWithComponents } from 'react-router'

/** What the map's panels need of a fetcher, whatever its action answers. */
export type MapFetcher = Pick<FetcherWithComponents<unknown>, 'Form' | 'submit' | 'state' | 'data'>
