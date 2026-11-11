import { redirect } from 'react-router'
import { renderOurSpeakerListPdf } from '~/features/events/server/our-speaker-list-pdf.server'
import { getOurSpeakerListPage } from '~/features/events/server/our-speakers.queries'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import type { Route } from './+types/ours-pdf'

// « Notre liste » as the PDF the other congregations receive, for whoever may see the visiting speakers — the same
// people who see the page. The e-mail attaches exactly this document.
export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewExternalSpeakers) && !permissions.has(Permission.CanManageExternalSpeakers)) {
    logger.warn(`Tried to download our speaker list. User ID: ${context.get(currentAccountContext).id}. No rights.`)
    throw redirect('/')
  }
  const congregation = context.get(congregationContext)
  const preview = new URL(request.url).searchParams.has('preview')
  const page = await withScopeFromContext(context, (db, congregationId) => getOurSpeakerListPage(db, congregationId))
  // The page hides its download button for a list nobody is on: it would print a blank sheet.
  if (!page.brothers.some(brother => brother.onList)) throw redirect('/programs/external-speakers/ours')

  const { filename, content } = await renderOurSpeakerListPdf(page, {
    congregationName: congregation.displayName,
    timezone: congregation.timezone,
    locale: congregation.locale,
    now: new Date(),
  })
  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      // « Aperçu » in the send dialog opens it in the browser; the download button saves it.
      'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Content-Length': String(content.length),
      'Cache-Control': 'private, no-store',
    },
  })
}
