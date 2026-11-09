import { FormSection } from '@unitae/ui'
import { FileText, RotateCcw, Upload, X } from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { PdfBoardCard } from '~/features/display-board/server/board-home.queries'
import { DocumentSheet } from '~/features/display-board/ui/DocumentSheet'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

export interface CurrentFile {
  card: PdfBoardCard
  versions: number
  /** Where the history opens, beside the form. */
  historyTo: string
}

interface PdfFileFieldProps {
  /** The file it shows now; none on a new document, where a file is required. */
  current: CurrentFile | null
  errors?: string[]
  timeZone: string
  onFile?: (file: File | null) => void
}

function formatDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', timeZone }).format(date)
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? m.board_form_file_size_kb({ size: Math.max(1, Math.round(bytes / 1024)) })
    : m.board_form_file_size_mb({ size: (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') })
}

function fileFacts({ card, versions }: CurrentFile, timeZone: string) {
  const day = card.replacedAt
    ? m.board_form_file_replaced({ date: formatDay(card.replacedAt, timeZone) })
    : m.board_form_file_added({ date: formatDay(card.createdAt, timeZone) })
  return versions > 1 ? `${day} · ${m.board_form_file_versions({ count: versions })}` : day
}

/**
 * The PDF itself: a drop zone on a new document, which fills the title in from the file's name; on an
 * existing one, its current file with its history, and a way to replace it.
 */
export function PdfFileField({ current, errors, timeZone, onFile }: PdfFileFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (files: FileList | null) => {
    const file = files?.[0] ?? null
    setChosen(file)
    onFile?.(file)
  }
  // Set the input's own files, so the form posts the dropped PDF and its change tracking sees it.
  const setFiles = (files: FileList | null) => {
    if (input.current == null) return
    if (files) input.current.files = files
    else input.current.value = ''
    input.current.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length > 0) setFiles(event.dataTransfer.files)
  }
  const dropProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: drop,
  }

  return (
    <FormSection
      title={m.board_form_file_title()}
      description={current ? m.board_form_file_description_edit() : m.board_form_file_description_new()}
    >
      <div className="col-span-full flex flex-col gap-2.5">
        <input
          ref={input}
          id="document-file"
          name="document"
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={event => pick(event.currentTarget.files)}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? 'document-file-error' : undefined}
        />

        {current && chosen == null && (
          <div className="flex gap-4 rounded-lg border border-border bg-surface p-3">
            <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md border border-border">
              <DocumentSheet card={current.card} />
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-1">
              <span className="font-medium">{m.board_form_file_current()}</span>
              <span className="text-faint text-sm">{fileFacts(current, timeZone)}</span>
              <span className="mt-1.5 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {m.board_form_file_replace()}
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={current.historyTo} preventScrollReset>
                    {m.board_form_file_history()}
                  </Link>
                </Button>
              </span>
            </div>
          </div>
        )}

        {chosen && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              {current && <span className="text-faint text-xs">{m.board_form_file_new()}</span>}
              <span className="truncate font-medium">{chosen.name}</span>
              <span className="text-faint text-sm">{formatSize(chosen.size)}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFiles(null)}>
              <X className="size-4" aria-hidden="true" />
              {current ? m.board_form_file_keep() : m.board_form_file_remove()}
            </Button>
          </div>
        )}

        {chosen == null && (
          <label
            htmlFor="document-file"
            {...dropProps}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong border-dashed text-muted-foreground text-sm transition-colors hover:bg-hover',
              current ? 'px-3 py-2.5' : 'flex-col justify-center px-4 py-10 text-center',
              dragging && 'border-brand bg-hover',
            )}
          >
            <Upload className={current ? 'size-4' : 'size-5'} aria-hidden="true" />
            {current ? (
              m.board_form_file_drop_more()
            ) : (
              <>
                <span className="font-medium text-foreground">{m.board_form_file_drop()}</span>
                <span>{m.board_form_file_limit()}</span>
              </>
            )}
          </label>
        )}

        {errors?.length ? (
          <p id="document-file-error" className="text-destructive text-sm">
            {errors[0]}
          </p>
        ) : null}
      </div>
    </FormSection>
  )
}
