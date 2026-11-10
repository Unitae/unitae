import { FactList } from '@unitae/ui'
import { RefreshCw } from 'lucide-react'
import { Form } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/shared/ui/dialog'
import { shortDay } from '~/shared/utils/format-day'

/** What the dialog tells before a sync: where it reads, what it keeps, what it did last time. */
export interface SyncFacts {
  /** « bano.openstreetmap.fr · bano-93.csv ». */
  source: string
  zips: string[]
  perimeter: boolean
  last: { day: string; createdCount: number | null; missingCount: number | null } | null
}

interface BuildingSyncDialogProps {
  facts: SyncFacts
  today: string
  /** A sync is going: the button says so and opens nothing, one sync at a time. */
  running: boolean
}

/** « Synchroniser… »: what the sync reads and what it changes, before it starts. */
export function BuildingSyncDialog({ facts, today, running }: BuildingSyncDialogProps) {
  if (running) {
    return (
      <Button variant="outline" size="sm" disabled>
        <RefreshCw className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {m.prospection_sync_running_button()}
      </Button>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCw aria-hidden="true" />
          {m.prospection_sync_open()}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.prospection_sync_dialog_title()}</DialogTitle>
          <DialogDescription>{m.prospection_sync_dialog_intro()}</DialogDescription>
        </DialogHeader>
        <FactList
          className="text-sm"
          facts={[
            { label: m.prospection_sync_fact_file(), value: facts.source },
            {
              label: m.prospection_sync_fact_zips(),
              value: facts.zips.length > 0 ? facts.zips.join(', ') : m.prospection_sync_zips_none(),
            },
            {
              label: m.prospection_sync_fact_perimeter(),
              value: facts.perimeter ? m.prospection_sync_perimeter_drawn() : m.prospection_sync_perimeter_none(),
            },
            {
              label: m.prospection_sync_fact_last(),
              value: facts.last
                ? m.prospection_sync_last({
                    date: shortDay(facts.last.day, today),
                    created: facts.last.createdCount ?? 0,
                    missing: facts.last.missingCount ?? 0,
                  })
                : m.prospection_sync_last_never(),
            },
          ]}
        />
        <div className="flex flex-col gap-1.5 text-sm">
          <h3 className="font-medium">{m.prospection_sync_changes_title()}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
            <li>{m.prospection_sync_change_new()}</li>
            <li>{m.prospection_sync_change_missing()}</li>
            <li>{m.prospection_sync_change_kept()}</li>
          </ul>
        </div>
        <p className="text-faint text-sm">{m.prospection_sync_duration()}</p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{m.common_cancel()}</Button>
          </DialogClose>
          <Form method="post" action="/territories/buildings/sync">
            <Button type="submit">{m.prospection_sync_start()}</Button>
          </Form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
