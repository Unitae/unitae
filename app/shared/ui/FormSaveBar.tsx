import { SaveBar } from '@unitae/ui'
import * as m from '~/i18n/paraglide/messages'

interface FormSaveBarProps {
  /** Unsaved changes to announce, or `null` on a form with nothing to compare with yet (a creation). */
  changes: number | null
  /** Cancel, then the primary save. */
  children: React.ReactNode
}

/**
 * The library save bar, pinned for this shell: the document scrolls, so it is fixed rather than sticky; it sits
 * beside the open sidebar on wide screens and above the tab bar on phones. Leave room for it at the end of the
 * form (`pb-24`).
 */
export function FormSaveBar({ changes, children }: FormSaveBarProps) {
  return (
    <SaveBar
      aria-label={m.form_save_bar()}
      dirty={changes != null && changes > 0}
      label={
        changes == null || changes === 0
          ? undefined
          : (changes === 1 ? m.form_changes_one : m.form_changes_many)({ count: String(changes) })
      }
      className="fixed inset-x-0 bottom-0 z-30 max-md:bottom-[calc(56px+env(safe-area-inset-bottom))] md:group-has-data-[state=expanded]/sidebar-wrapper:left-(--sidebar-width)"
    >
      {children}
    </SaveBar>
  )
}
