import { Spline, Trash2 } from 'lucide-react'
import type { useFetcher } from 'react-router'
import type { CardOverlayPath } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PERIMETER_DRAFT_COLOR } from './use-card-overlay-editor'

function verticesCount(count: number): string {
  return count === 1
    ? m.settings_territories_card_overlays_vertices_count_one()
    : m.settings_territories_card_overlays_vertices_count_other({ count })
}

type PerimeterCardProps = {
  perimeter: { paths: CardOverlayPath[] } | null
  hasMapApiKey: boolean
  perimeterMode: 'new' | 'edit' | null
  fetcher: ReturnType<typeof useFetcher>
  onEditPerimeter: () => void
  onNewPerimeter: () => void
}

export function PerimeterCard({
  perimeter,
  hasMapApiKey,
  perimeterMode,
  fetcher,
  onEditPerimeter,
  onNewPerimeter,
}: PerimeterCardProps) {
  const hasPerimeter = perimeter != null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.settings_territories_card_overlays_perimeter_section_title()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          {m.settings_territories_card_overlays_perimeter_section_subtitle()}
        </p>
        {hasPerimeter && perimeter != null ? (
          <div
            className="flex flex-wrap items-center gap-3 rounded-md border-l-4 bg-card py-2 pr-2 pl-3 shadow-sm"
            style={{ borderLeftColor: PERIMETER_DRAFT_COLOR }}
          >
            <div
              className="size-6 rounded-full border"
              style={{ backgroundColor: PERIMETER_DRAFT_COLOR }}
              role="img"
              aria-label={m.settings_territories_card_overlays_perimeter_section_title()}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{m.settings_territories_card_overlays_perimeter_section_title()}</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
              {verticesCount(perimeter.paths.length)}
            </span>
            {hasMapApiKey ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onEditPerimeter}
                disabled={perimeterMode === 'edit'}
                aria-label={m.settings_territories_card_overlays_perimeter_edit_button()}
              >
                <Spline aria-hidden className="size-4" />
                <span className="sr-only sm:not-sr-only">
                  {m.settings_territories_card_overlays_perimeter_edit_button()}
                </span>
              </Button>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={m.settings_territories_card_overlays_perimeter_delete_button()}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {m.settings_territories_card_overlays_perimeter_delete_confirm_title()}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.settings_territories_card_overlays_perimeter_delete_confirm_description()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.settings_territories_card_overlays_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      // Programmatic submit — see the zone delete handler for the rationale.
                      fetcher.submit({ intent: 'clear-perimeter' }, { method: 'post' })
                    }}
                  >
                    {m.settings_territories_card_overlays_perimeter_delete_button()}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm italic">
              {m.settings_territories_card_overlays_perimeter_undefined()}
            </p>
            {hasMapApiKey ? (
              <Button type="button" onClick={onNewPerimeter} disabled={perimeterMode === 'new'} className="self-start">
                {m.settings_territories_card_overlays_perimeter_set_button()}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
