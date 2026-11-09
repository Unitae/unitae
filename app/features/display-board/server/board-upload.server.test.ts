import { MaxFileSizeExceededError } from '@mjackson/form-data-parser'
import { describe, expect, it } from 'vitest'
import { parseBoardUpload } from '~/features/display-board/server/board-upload.server'

function post(fields: Record<string, string | File>) {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.append(name, value)
  return new Request('http://localhost/board/documents/new', { method: 'POST', body })
}

const pdf = (size: number, name = 'Lettre du Collège.pdf') =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' })

describe('parseBoardUpload', () => {
  it('gives the fields and the uploaded PDF', async () => {
    const { form, file } = await parseBoardUpload(post({ title: 'Lettre', document: pdf(1024) }))

    expect(form.get('title')).toBe('Lettre')
    expect(file).toMatchObject({ name: 'Lettre du Collège.pdf', size: 1024, type: 'application/pdf' })
  })

  it('gives no file when the field was left empty, as an edit that keeps the current one', async () => {
    const { file } = await parseBoardUpload(post({ title: 'Lettre', document: pdf(0, '') }))

    expect(file).toBeNull()
  })

  it('refuses a file over the limit', async () => {
    await expect(parseBoardUpload(post({ document: pdf(21 * 1024 * 1024) }))).rejects.toBeInstanceOf(
      MaxFileSizeExceededError,
    )
  })
})
