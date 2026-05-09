import { ArrowLeft, Search, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, redirect } from 'react-router'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import {
  getDynamicDocumentData,
  markDynamicDocumentViewed,
} from '~/features/display-board/server/dynamic-documents.server'
import { PioneersView } from '~/features/display-board/ui/dynamic/PioneersView'
import { ProgrammeView } from '~/features/display-board/ui/dynamic/ProgrammeView'
import { PublisherGroupsView } from '~/features/display-board/ui/dynamic/PublisherGroupsView'
import * as m from '~/i18n/paraglide/messages'
import {
  permissionsContext,
  requirePermission,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { useDebouncedValue } from '~/shared/ui/hooks/use-debounced-value'
import { Input } from '~/shared/ui/input'
import { requireParamId } from '~/shared/utils/params.server'
import { cn } from '~/shared/utils/utils'

import type { Route } from './+types/viewer'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_viewer_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardViewer)

  const currentUser = context.get(userContext)

  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const settings = await db.boardDynamicDocumentSettings.findUnique({
      where: {
        id_congregationId: { id: dynamicId, congregationId },
      },
    })

    if (!settings) throw redirect('/board')

    await markDynamicDocumentViewed(db, dynamicId, currentUser.id)

    const data = await getDynamicDocumentData(db, settings.dynamicType, settings.dynamicRef, congregationId, {
      showServices: settings.showServices,
      dynamicConfig: settings.dynamicConfig,
    })

    return { settings, data }
  })
}

export default function DynamicViewerPage({ loaderData }: Route.ComponentProps) {
  const { settings, data } = loaderData
  const isProgramme = data?.type === DynamicType.Programme

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const debouncedSearch = useDebouncedValue(searchValue, 200)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="-m-4 flex h-[calc(100vh-2rem)] flex-col md:-m-6 md:h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/board" title={m.board_viewer_back()}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="truncate font-semibold text-sm">{settings.title}</h1>
        </div>

        {isProgramme && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => {
                setSearchOpen(prev => !prev)
                if (searchOpen) setSearchValue('')
              }}
              aria-label={m.board_viewer_search_toggle()}
            >
              {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
            </Button>
            <div className={cn('relative hidden md:block', searchOpen && '!block')}>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                placeholder={m.board_viewer_search_placeholder()}
                className="w-48 pr-9 pl-9 md:w-56"
                aria-label={m.board_viewer_search_toggle()}
              />
              {searchValue.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setSearchValue('')}
                >
                  <X className="size-3.5" />
                  <span className="sr-only">{m.common_clear()}</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-2 px-4 pt-6 md:px-6">
          <h2 className="text-center font-bold font-display text-2xl tracking-tight">{settings.title}</h2>
        </div>
        {data?.type === DynamicType.PublisherGroups && <PublisherGroupsView groups={data.groups} />}
        {data?.type === DynamicType.Pioneers && <PioneersView pioneers={data.pioneers} />}
        {data?.type === DynamicType.Programme && (
          <ProgrammeView
            events={data.events}
            showServices={data.showServices}
            config={data.config}
            highlightQuery={debouncedSearch}
            scrollContainerRef={scrollContainerRef}
          />
        )}
      </div>
    </div>
  )
}
