import { MaxFileSizeExceededError } from '@mjackson/form-data-parser'
import { describe, expect, it } from 'vitest'
import { parseBoardUpload, readPdfForm } from '~/features/display-board/server/board-upload.server'

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

describe('readPdfForm', () => {
  const fields = { title: '  Lettre  ', sectionId: '4', show: 'from', from: '2026-11-12', until: '2026-11-30' }

  it('gives a reviewer the values and the display window as posted', async () => {
    const form = await readPdfForm(post({ ...fields, highlighted: 'on', document: pdf(10) }), { canReview: true })

    expect(form).toMatchObject({
      ok: true,
      title: 'Lettre',
      sectionId: 4,
      display: { show: 'from', from: '2026-11-12', until: '2026-11-30', highlighted: true },
    })
    expect(form.ok && form.file?.size).toBe(10)
  })

  it('leaves out the display window for an uploader, whatever the form carries', async () => {
    const form = await readPdfForm(post({ ...fields, highlighted: 'on' }), { canReview: false })

    expect(form).toMatchObject({ ok: true, display: null, file: null })
  })

  it('answers a missing title on the field', async () => {
    const form = await readPdfForm(post({ ...fields, title: ' ' }), { canReview: true })

    expect(form.ok ? null : Object.keys(form.reply.error ?? {})).toEqual(['title'])
  })

  it('answers a file over the limit on the file field', async () => {
    const form = await readPdfForm(post({ ...fields, document: pdf(21 * 1024 * 1024) }), { canReview: true })

    expect(form.ok ? null : Object.keys(form.reply.error ?? {})).toEqual(['document'])
  })

  it('names the field a display window error belongs to', async () => {
    const form = await readPdfForm(post(fields), { canReview: true })

    expect(form.ok && form.fail('until-before-from').error).toEqual({ until: [expect.any(String)] })
  })
})
