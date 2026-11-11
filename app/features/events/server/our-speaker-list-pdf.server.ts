import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { BOARD_FALLBACK_FAMILY, loadBoardPdfTypeface } from '~/features/display-board/index.server'
import type { OurSpeakerListPage } from '~/features/events/model/our-speaker.type'
import { addressFit, addressHalves, ourListFilename } from '~/features/events/model/our-speaker-sheet'
import { type OurSpeakerListSheet, ourSpeakerListDocument } from '~/features/events/ui/pdf/OurSpeakerListDocument'
import { getLocale, isLocale } from '~/i18n/paraglide/runtime'
import { renderPdfBuffer } from '~/shared/infra/pdf.server'
import { formatDateForInput, formatEventDate } from '~/shared/utils/event-time'
import { DEFAULT_LOCALE } from '~/shared/utils/language'
import { runWithLocale } from '~/shared/utils/locale-scope.server'

// The PDF of « Notre liste », for the download and for the e-mail alike, so both send exactly the same document: the
// brothers ticked « Sur notre liste », each with his shared contact, under the coordinator and our public talk
// coordinator.

export async function buildOurSpeakerListPdf(
  page: OurSpeakerListPage,
  options: { congregationName: string; timezone: string; now: Date },
): Promise<{ document: ReactElement<DocumentProps>; filename: string; count: number }> {
  // Fira Sans, measured with the very font objects react-pdf sets the list in.
  const measurer = await loadBoardPdfTypeface('fira')
  const brothers = page.brothers
    .filter(brother => brother.onList)
    .map(brother => ({
      memberId: brother.memberId,
      name: brother.name,
      note: brother.note,
      phones: brother.shared.phones,
      emails: brother.shared.emails.map(address => {
        const width = (text: string) => measurer.width(text, 'regular')
        return { address, ...addressFit(width(address), Math.max(...addressHalves(address).map(width))) }
      }),
      talks: brother.talks,
    }))
  const sheet: OurSpeakerListSheet = {
    congregationName: options.congregationName,
    date: formatEventDate(options.now, options.timezone, getLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    coordinator: page.header.coordinator,
    responsible: page.header.responsible,
    brothers,
    fontFamily: BOARD_FALLBACK_FAMILY,
  }
  const filename = ourListFilename(options.congregationName, formatDateForInput(options.now, options.timezone))
  return {
    document: ourSpeakerListDocument(sheet),
    filename,
    count: brothers.length,
  }
}

/**
 * The PDF's bytes, in the congregation's language whoever downloads or sends it: it is the congregation's document for
 * other congregations. Its labels are read while react-pdf lays it out, so the rendering runs in that language too.
 */
export function renderOurSpeakerListPdf(
  page: OurSpeakerListPage,
  options: { congregationName: string; timezone: string; locale: string; now: Date },
): Promise<{ filename: string; content: Buffer; count: number }> {
  return runWithLocale(isLocale(options.locale) ? options.locale : DEFAULT_LOCALE, async () => {
    const { document, filename, count } = await buildOurSpeakerListPdf(page, options)
    return { filename, count, content: await renderPdfBuffer(document) }
  })
}
