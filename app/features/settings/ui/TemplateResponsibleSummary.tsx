import { UserCog } from 'lucide-react'
import { findResponsible, ResponsibilityScope } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'
import { Badge } from '~/shared/ui/badge'

export type TemplateResponsibleRow = { scope: string; role: { key: string; name: string | null } }

// A template names at most one role per scope, and the two must stay
// distinguishable wherever they are shown — otherwise "Responsable sono" reads
// as if it ran the whole meeting. Both read-only presentations live here so
// that labelling is decided once.

/** Header badges on the template detail page. */
export function TemplateResponsibleBadges({ responsibles }: { responsibles: TemplateResponsibleRow[] }) {
  const programme = findResponsible(responsibles, ResponsibilityScope.Programme)
  const service = findResponsible(responsibles, ResponsibilityScope.Service)

  return (
    <>
      {programme && (
        <Badge variant="outline">
          <UserCog className="mr-1 size-3" />
          {getRoleDisplayName(programme.role)}
        </Badge>
      )}
      {service && (
        <Badge variant="outline">
          <UserCog className="mr-1 size-3" />
          {m.settings_template_view_service_responsible_badge({ name: getRoleDisplayName(service.role) })}
        </Badge>
      )}
    </>
  )
}

/**
 * The single "Responsible" column of the template list.
 *
 * Both scopes stack in one cell rather than claiming a second column: the table
 * is already wide, and a template usually names one role or none.
 */
export function TemplateResponsibleCell({ responsibles }: { responsibles: TemplateResponsibleRow[] }) {
  const programme = findResponsible(responsibles, ResponsibilityScope.Programme)
  const service = findResponsible(responsibles, ResponsibilityScope.Service)

  if (!programme && !service) return <span className="text-muted-foreground text-sm">—</span>

  return (
    <div className="flex flex-col text-sm">
      {programme && <span>{getRoleDisplayName(programme.role)}</span>}
      {service && (
        <span className="text-muted-foreground">
          {m.settings_template_view_service_responsible_badge({ name: getRoleDisplayName(service.role) })}
        </span>
      )}
    </div>
  )
}
