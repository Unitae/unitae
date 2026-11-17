import { Callout } from '@unitae/ui'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { filenameFromDisposition, saveBlob } from '~/shared/ui/download-file'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

type ExportFormat = 'pdf' | 'xlsx'

interface AttendanceExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Newest first, from the first counted meeting to the current service year. */
  years: number[]
  /** The year the page shows: the dialog opens on it. */
  defaultYear: number
}

const yearLabel = (serviceYear: number) => `${serviceYear}–${serviceYear + 1}`

const URLS: Record<ExportFormat, (year: number) => string> = {
  pdf: year => `/attendance/record.pdf?year=${year}`,
  xlsx: year => `/attendance/attendance.xlsx?year=${year}`,
}

/**
 * « Exporter » on the attendance page, as the activity export does it: the format — the S-88 card or a spreadsheet —
 * and the service year, any of them, without stepping the page through the years first.
 */
export function AttendanceExportDialog({ open, onOpenChange, years, defaultYear }: AttendanceExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [year, setYear] = useState(defaultYear)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choices = years.includes(defaultYear) ? years : [defaultYear, ...years]

  function reset() {
    setFormat('pdf')
    setYear(defaultYear)
    setError(null)
  }

  // Closing by hand waits for the file; the download closes it itself once saved.
  function close(next: boolean) {
    if (busy) return
    if (!next) reset()
    onOpenChange(next)
  }

  async function download() {
    setError(null)
    setBusy(true)
    try {
      const response = await fetch(URLS[format](year))
      // fetch follows redirects: a right taken away or an expired session comes back as a page with a 200. Never
      // save that as a file, and do not suggest trying again — it cannot help.
      if (response.redirected) {
        setError(m.attendance_export_error_redirected())
        return
      }
      if (!response.ok) throw new Error(`Attendance export failed: ${response.status}`)
      const filename =
        filenameFromDisposition(response.headers.get('Content-Disposition') ?? '') ??
        (format === 'pdf'
          ? m.attendance_record_filename_pdf({ year: `${year}-${year + 1}` })
          : m.attendance_record_filename_xlsx({ year: `${year}-${year + 1}` }))
      saveBlob(await response.blob(), filename)
      reset()
      onOpenChange(false)
    } catch {
      setError(m.attendance_export_error_generic())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.attendance_export_title()}</DialogTitle>
          <DialogDescription>{m.attendance_export_description()}</DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">{m.attendance_export_generating()}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label>{m.attendance_export_format()}</Label>
              <RadioGroup
                value={format}
                onValueChange={value => setFormat(value as ExportFormat)}
                className="flex flex-col gap-2"
              >
                {(['pdf', 'xlsx'] as const).map(option => (
                  <label
                    key={option}
                    htmlFor={`attendance-export-${option}`}
                    className="flex cursor-pointer items-start gap-2 rounded-md border p-3"
                  >
                    <RadioGroupItem value={option} id={`attendance-export-${option}`} className="mt-0.5" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm">
                        {option === 'pdf' ? m.attendance_export_pdf() : m.attendance_export_xlsx()}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {option === 'pdf' ? m.attendance_export_pdf_hint() : m.attendance_export_xlsx_hint()}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="attendance-export-year">{m.attendance_export_year()}</Label>
              <Select value={String(year)} onValueChange={value => setYear(Number(value))}>
                <SelectTrigger id="attendance-export-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map(choice => (
                    <SelectItem key={choice} value={String(choice)}>
                      {yearLabel(choice)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error != null && <Callout tone="danger" role="alert" title={error} />}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
            {m.common_cancel()}
          </Button>
          <Button type="button" onClick={download} disabled={busy}>
            {m.attendance_export()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
