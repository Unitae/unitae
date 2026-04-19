import { ArrowLeft } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import {
  getDynamicDocumentData,
  markDynamicDocumentViewed,
} from '~/features/display-board/server/dynamic-documents.server'
import { PioneersView } from '~/features/display-board/ui/dynamic/PioneersView'
import { ProgrammeView } from '~/features/display-board/ui/dynamic/ProgrammeView'
import { PublisherGroupsView } from '~/features/display-board/ui/dynamic/PublisherGroupsView'
import * as m from '~/paraglide/messages'
import { userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Button } from '~/shared/ui/button'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/viewer'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_viewer_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)

  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const settings = await db.boardDynamicDocumentSettings.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: dynamicId, congregationId },
      },
    })

    if (!settings) throw redirect('/board')

    await markDynamicDocumentViewed(db, dynamicId, currentUser.id)

    const data = await getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
      showServices: settings.showServices,
    })

    return { settings, data }
  })
}

export default function DynamicViewerPage({ loaderData }: Route.ComponentProps) {
  const { settings, data } = loaderData

  return (
    <div className="-m-4 md:-m-6 flex h-[calc(100vh-2rem)] flex-col md:h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/board" title={m.board_viewer_back()}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="truncate font-semibold text-sm">{settings.title}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-2 px-4 pt-6 md:px-6">
          <h2 className="text-center font-bold font-display text-2xl tracking-tight">{settings.title}</h2>
        </div>
        {data?.type === DynamicType.PublisherGroups && <PublisherGroupsView groups={data.groups} />}
        {data?.type === DynamicType.Pioneers && <PioneersView pioneers={data.pioneers} />}
        {data?.type === DynamicType.Programme && (
          <ProgrammeView events={data.events} showServices={data.showServices} />
        )}
      </div>
    </div>
  )
}
