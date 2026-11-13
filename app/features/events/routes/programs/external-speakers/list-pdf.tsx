import { redirect } from 'react-router'
import { getSpeakerListPdf } from '~/features/events/server/speaker-list-file.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/list-pdf'

const UNSAFE_FILENAME = /[^\w .()-]/g

// The PDF of a congregation's latest list, as it was received: opened in the browser, for whoever may see the speakers.
export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewExternalSpeakers) && !permissions.has(Permission.CanManageExternalSpeakers)) {
    throw redirect('/')
  }
  const speakerCongregationId = requireParamId(params.speakerCongregationId, '/programs/external-speakers')
  const kept = await withScopeFromContext(context, (db, congregationId) =>
    db.speakerCongregation.findFirst({
      where: { id: speakerCongregationId, congregationId },
      select: { listFileKey: true, listFileName: true },
    }),
  )
  const file = kept?.listFileKey ? await getSpeakerListPdf(kept.listFileKey) : null
  if (!file) throw new Response(null, { status: 404 })
  const name = (kept?.listFileName ?? m.external_speakers_list_pdf_filename_fallback()).replace(UNSAFE_FILENAME, '_')
  return new Response(file.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
