const CONTENT_DISPOSITION_FILENAME_RE = /filename="?([^"]+)"?/

/** The file name a download response announces in its Content-Disposition header, if any. */
export function filenameFromDisposition(contentDisposition: string): string | null {
  return contentDisposition.match(CONTENT_DISPOSITION_FILENAME_RE)?.[1] ?? null
}

/** Saves a fetched file under `filename`, as a download the browser handles, without leaving the page. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
