import { Plus } from 'lucide-react'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

interface OrgHeadingProps {
  /** Whether the reader may create a role; without the right, no « + ». */
  canCreate: boolean
  /** « Nouveau rôle »: a link to the dialog, or what opens it here. */
  newRole: { to: string } | { onClick: () => void }
}

/**
 * The organigram's title and subtitle. On a phone, « Nouveau rôle » is a « + » beside the title, as the shell's other
 * phone headers carry their action, instead of a full-width button under it; from md up it stays in the top bar.
 */
export function OrgHeading({ canCreate, newRole }: OrgHeadingProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-h1">{m.org_title()}</h1>
        <p className="text-muted-foreground text-sm">{m.org_subtitle()}</p>
      </div>
      {canCreate &&
        ('to' in newRole ? (
          <Button asChild size="icon" className="md:hidden">
            <Link to={newRole.to} aria-label={m.org_new_role()}>
              <Plus aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button size="icon" className="md:hidden" aria-label={m.org_new_role()} onClick={newRole.onClick}>
            <Plus aria-hidden="true" />
          </Button>
        ))}
    </div>
  )
}
