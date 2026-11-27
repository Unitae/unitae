const CONTENT_DISPOSITION_FILENAME_RE = /filename="?([^";]+)"?/
const CONTENT_DISPOSITION_UTF8_RE = /filename\*=UTF-8''([^;]+)/i

/**
 * The file name a download response announces in its Content-Disposition header, if any: the UTF-8 `filename*` first
 * (a name in Cyrillic or with « œ »), the plain `filename` otherwise.
 */
export function filenameFromDisposition(contentDisposition: string): string | null {
  const utf8 = contentDisposition.match(CONTENT_DISPOSITION_UTF8_RE)?.[1]
  if (utf8 != null) {
    try {
      return decodeURIComponent(utf8)
    } catch {
      // A malformed escape: the ASCII name still names the file.
    }
  }
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
