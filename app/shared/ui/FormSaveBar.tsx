import { SaveBar } from '@unitae/ui'
import * as m from '~/i18n/paraglide/messages'

interface FormSaveBarProps {
  /** Unsaved changes to announce, or `null` on a form with nothing to compare with yet (a creation). */
  changes: number | null
  /** On a creation, what saving will do (« Créés en brouillon… ») in place of the changes. */
  label?: React.ReactNode
  /** Cancel, then the primary save. */
  children: React.ReactNode
}

/**
 * The library save bar, pinned for this shell: the document scrolls, so it is fixed rather than sticky; it sits
 * beside the open sidebar on wide screens. On a phone it takes the tab bar's place, one bar at the bottom rather than
 * two stacked: its `data-bottom-sheet` marker hides the tab bar, as a bottom sheet does. Leave room for it at the end
 * of the form (`pb-24`).
 */
export function FormSaveBar({ changes, label, children }: FormSaveBarProps) {
  return (
    <>
      <span data-bottom-sheet="" hidden />
      <SaveBar
        aria-label={m.form_save_bar()}
        dirty={changes != null && changes > 0}
        label={changes == null || changes === 0 ? label : m.form_changes({ count: changes })}
        className="fixed inset-x-0 bottom-0 z-30 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:group-has-data-[state=expanded]/sidebar-wrapper:left-(--sidebar-width)"
      >
        {children}
      </SaveBar>
    </>
  )
}
