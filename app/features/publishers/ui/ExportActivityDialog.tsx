import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { MemberOption } from '~/features/publishers/ui/MemberMultiSelect'
import { MemberMultiSelect } from '~/features/publishers/ui/MemberMultiSelect'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { formatGroupName } from '~/shared/utils/format-group-name'

type ExportFormat = 'xlsx' | 'pdfs'
type ExportScope = 'all' | 'group' | 'members'

export interface PublisherGroupOption {
  id: number
  name: string
}

interface ExportActivityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableYears: number[]
  defaultYear: number
  publisherGroups: PublisherGroupOption[]
  members: MemberOption[]
}

export function ExportActivityDialog({
  open,
  onOpenChange,
  availableYears,
  defaultYear,
  publisherGroups,
  members,
}: ExportActivityDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('pdfs')
  const [year, setYear] = useState<number>(defaultYear)
  const [scope, setScope] = useState<ExportScope>('all')
  const [groupId, setGroupId] = useState<number | null>(null)
  const [publisherIds, setPublisherIds] = useState<number[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const yearsForSelect = availableYears.length > 0 ? availableYears : [defaultYear]
  const scopeDisabled = format === 'xlsx'

  function reset() {
    setFormat('pdfs')
    setYear(defaultYear)
    setScope('all')
    setGroupId(null)
    setPublisherIds([])
    setError(null)
  }

  function handleClose(nextOpen: boolean) {
    if (isGenerating) return
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  async function handleExport() {
    setError(null)
    const url = buildExportUrl({ format, year, scope, groupId, publisherIds })
    if (url == null) {
      setError(m.activity_export_dialog_error_scope())
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Export failed: ${response.status}`)

      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = parseFilename(disposition) ?? fallbackFilename(format, year)
      const blob = await response.blob()
      triggerBlobDownload(blob, filename)
      handleClose(false)
    } catch (_error) {
      setError(m.activity_export_dialog_error_generic())
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{m.activity_export_dialog_title()}</DialogTitle>
          <DialogDescription>{m.activity_export_dialog_description()}</DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">{m.activity_export_dialog_generating()}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
            <FormatField format={format} onFormatChange={setFormat} />
            <YearField year={year} years={yearsForSelect} onYearChange={setYear} />
            {!scopeDisabled && (
              <ScopeField
                scope={scope}
                onScopeChange={setScope}
                groupId={groupId}
                onGroupChange={setGroupId}
                publisherIds={publisherIds}
                onPublisherIdsChange={setPublisherIds}
                publisherGroups={publisherGroups}
                members={members}
              />
            )}
            {error != null && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}

        <DialogFooter className="mt-2 flex-shrink-0">
          <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isGenerating}>
            {m.activity_export_dialog_cancel()}
          </Button>
          <Button type="button" onClick={handleExport} disabled={isGenerating}>
            {m.activity_export_dialog_submit()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormatField({ format, onFormatChange }: { format: ExportFormat; onFormatChange: (f: ExportFormat) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{m.activity_export_dialog_format_label()}</Label>
      <RadioGroup
        value={format}
        onValueChange={value => onFormatChange(value as ExportFormat)}
        className="flex flex-col gap-2"
      >
        <label htmlFor="export-format-pdfs" className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
          <RadioGroupItem value="pdfs" id="export-format-pdfs" className="mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-sm">{m.activity_export_dialog_format_pdfs()}</span>
            <span className="text-muted-foreground text-xs">{m.activity_export_dialog_format_pdfs_hint()}</span>
          </div>
        </label>
        <label htmlFor="export-format-xlsx" className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
          <RadioGroupItem value="xlsx" id="export-format-xlsx" className="mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-sm">{m.activity_export_dialog_format_xlsx()}</span>
            <span className="text-muted-foreground text-xs">{m.activity_export_dialog_format_xlsx_hint()}</span>
          </div>
        </label>
      </RadioGroup>
    </div>
  )
}

function YearField({
  year,
  years,
  onYearChange,
}: {
  year: number
  years: number[]
  onYearChange: (y: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="export-year">{m.activity_export_dialog_year_label()}</Label>
      <Select value={String(year)} onValueChange={value => onYearChange(Number(value))}>
        <SelectTrigger id="export-year">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map(y => (
            <SelectItem key={y} value={String(y)}>
              {m.activity_export_dialog_year_option({ start: String(y), end: String(y + 1) })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface ScopeFieldProps {
  scope: ExportScope
  onScopeChange: (s: ExportScope) => void
  groupId: number | null
  onGroupChange: (id: number | null) => void
  publisherIds: number[]
  onPublisherIdsChange: (ids: number[]) => void
  publisherGroups: PublisherGroupOption[]
  members: MemberOption[]
}

function ScopeField(props: ScopeFieldProps) {
  const { scope, onScopeChange, groupId, onGroupChange, publisherIds, onPublisherIdsChange, publisherGroups, members } =
    props
  return (
    <div className="flex flex-col gap-2">
      <Label>{m.activity_export_dialog_scope_label()}</Label>
      <RadioGroup
        value={scope}
        onValueChange={value => onScopeChange(value as ExportScope)}
        className="flex flex-col gap-2"
      >
        <label htmlFor="export-scope-all" className="flex cursor-pointer items-center gap-2 text-sm">
          <RadioGroupItem value="all" id="export-scope-all" />
          {m.activity_export_dialog_scope_all()}
        </label>
        <label htmlFor="export-scope-group" className="flex cursor-pointer items-center gap-2 text-sm">
          <RadioGroupItem value="group" id="export-scope-group" />
          {m.activity_export_dialog_scope_group()}
        </label>
        <label htmlFor="export-scope-members" className="flex cursor-pointer items-center gap-2 text-sm">
          <RadioGroupItem value="members" id="export-scope-members" />
          {m.activity_export_dialog_scope_members()}
        </label>
      </RadioGroup>
      {scope === 'group' && (
        <Select
          value={groupId != null ? String(groupId) : ''}
          onValueChange={value => onGroupChange(value === '' ? null : Number(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder={m.activity_export_dialog_scope_group_placeholder()} />
          </SelectTrigger>
          <SelectContent>
            {publisherGroups.map(group => (
              <SelectItem key={group.id} value={String(group.id)}>
                {formatGroupName(group.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {scope === 'members' && (
        <MemberMultiSelect
          members={members}
          selectedIds={publisherIds}
          onChange={onPublisherIdsChange}
          searchPlaceholder={m.activity_export_dialog_scope_members_search_placeholder()}
          emptyLabel={m.activity_export_dialog_scope_members_empty()}
        />
      )}
    </div>
  )
}

interface BuildExportUrlArgs {
  format: ExportFormat
  year: number
  scope: ExportScope
  groupId: number | null
  publisherIds: number[]
}

export function buildExportUrl(args: BuildExportUrlArgs): string | null {
  const params = new URLSearchParams({ year: String(args.year) })
  if (args.format === 'pdfs') {
    if (args.scope === 'group') {
      if (args.groupId == null) return null
      params.set('groupId', String(args.groupId))
    } else if (args.scope === 'members') {
      if (args.publisherIds.length === 0) return null
      params.set('publisherIds', args.publisherIds.join(','))
    }
  }
  return `/publishers/activity/export/${args.format}?${params.toString()}`
}

const CONTENT_DISPOSITION_FILENAME_RE = /filename="?([^"]+)"?/

function parseFilename(contentDisposition: string): string | null {
  const match = contentDisposition.match(CONTENT_DISPOSITION_FILENAME_RE)
  return match?.[1] ?? null
}

function fallbackFilename(format: ExportFormat, year: number): string {
  return format === 'xlsx' ? `Activité-Proclamateurs-${year}.xlsx` : `Activité-${year}.zip`
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
