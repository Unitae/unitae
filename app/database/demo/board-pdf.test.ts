import { describe, expect, it } from 'vitest'
import { readPdf } from '~/tests/helpers/pdf-text'
import type { BoardDocumentSeed } from './board'
import { boardPdf } from './board-pdf'

const document: BoardDocumentSeed = {
  title: 'Nettoyage de la salle',
  highlighted: false,
  age: 3,
  blocks: [{ kind: 'paragraph', text: 'Groupe NORD cette semaine.' }],
}

async function printed(blob: Blob): Promise<string> {
  const [page] = await readPdf(await blob.arrayBuffer())
  return page.text
}

describe('boardPdf', () => {
  it('says « Démo » on the files every demo copy shares', async () => {
    expect(await printed(await boardPdf('Assemblée de démonstration', document, { demo: true }))).toContain(
      'Démo — données inventées',
    )
  })

  it('stays a plain document for the marketing congregation', async () => {
    expect(await printed(await boardPdf('Assemblée de démonstration', document))).not.toContain('Démo')
  })
})
