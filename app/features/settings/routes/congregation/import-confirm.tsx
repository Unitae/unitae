import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Form, Link, redirect, useSearchParams } from 'react-router'
import type { ImportSummary } from '~/features/settings/server/data-transfer.type'
import { dataTransferQueue } from '~/features/settings/server/data-transfer-queue.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, requirePermission } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Alert, AlertDescription, AlertTitle } from '~/shared/ui/alert'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/import-confirm'

const ENTITY_LABELS: Record<string, () => string> = {
  congregation: () => m.data_transfer_entity_congregation(),
  settings: () => m.data_transfer_entity_settings(),
  'event-kinds': () => m.data_transfer_entity_event_kinds(),
  users: () => m.data_transfer_entity_users(),
  'congregation-user-permissions': () => m.data_transfer_entity_permissions(),
  'publisher-groups': () => m.data_transfer_entity_publisher_groups(),
  'publisher-activities': () => m.data_transfer_entity_publisher_activities(),
  territories: () => m.data_transfer_entity_territories(),
  buildings: () => m.data_transfer_entity_buildings(),
  'building-entrances': () => m.data_transfer_entity_building_entrances(),
  'building-accesses': () => m.data_transfer_entity_building_accesses(),
  'building-residential-data': () => m.data_transfer_entity_building_residential_data(),
  'territory-entrance-links': () => m.data_transfer_entity_territory_entrance_links(),
  'building-entrance-links': () => m.data_transfer_entity_building_entrance_links(),
  attributions: () => m.data_transfer_entity_attributions(),
  'programme-templates': () => m.data_transfer_entity_programme_templates(),
  'programme-template-parts': () => m.data_transfer_entity_programme_template_parts(),
  'programme-template-service-roles': () => m.data_transfer_entity_programme_template_service_roles(),
  'programme-template-responsibles': () => m.data_transfer_entity_programme_template_responsibles(),
  events: () => m.data_transfer_entity_events(),
  'programme-part-assignments': () => m.data_transfer_entity_programme_part_assignments(),
  'programme-service-role-assignments': () => m.data_transfer_entity_programme_service_role_assignments(),
  'board-sections': () => m.data_transfer_entity_board_sections(),
  'board-documents': () => m.data_transfer_entity_board_documents(),
  'board-document-versions': () => m.data_transfer_entity_board_document_versions(),
  'board-dynamic-document-settings': () => m.data_transfer_entity_board_dynamic_document_settings(),
  'consent-records': () => m.data_transfer_entity_consent_records(),
  'audit-logs': () => m.data_transfer_entity_audit_logs(),
  'data-deletion-records': () => m.data_transfer_entity_data_deletion_records(),
}

export const meta: Route.MetaFunction = () => {
  return [{ title: m.import_confirm_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.Admin)
  return null
}

export default function ImportConfirmPage() {
  const [searchParams] = useSearchParams()
  const storageKey = searchParams.get('storageKey')
  const summaryJson = searchParams.get('summary')

  if (!storageKey || !summaryJson) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.import_confirm_title()}
          breadcrumbs={[
            { label: m.sidebar_settings(), to: '/settings' },
            { label: m.settings_data_title(), to: '/settings/data' },
            { label: m.import_confirm_title() },
          ]}
        />
        <p className="text-muted-foreground text-sm">{m.import_confirm_no_data()}</p>
        <Button variant="outline" asChild>
          <Link to="/settings/data/import">{m.import_status_back()}</Link>
        </Button>
      </div>
    )
  }

  const summary: ImportSummary = JSON.parse(summaryJson)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.import_confirm_title()}
        subtitle={m.import_confirm_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings(), to: '/settings' },
          { label: m.settings_data_title(), to: '/settings/data' },
          { label: m.import_title(), to: '/settings/data/import' },
          { label: m.import_confirm_title() },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.import_confirm_entity_counts()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Nombre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(summary.entityCounts)
                .filter(([, count]) => count > 0)
                .map(([entity, count]) => (
                  <TableRow key={entity}>
                    <TableCell>{ENTITY_LABELS[entity]?.() ?? entity}</TableCell>
                    <TableCell className="text-right">{count}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {summary.conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              {m.import_confirm_conflicts()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground text-sm">{m.import_confirm_conflicts_description()}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Clé</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.conflicts.map(conflict => (
                  <TableRow key={`${conflict.entityType}-${JSON.stringify(conflict.naturalKey)}`}>
                    <TableCell>{ENTITY_LABELS[conflict.entityType]?.() ?? conflict.entityType}</TableCell>
                    <TableCell className="font-mono text-xs">{JSON.stringify(conflict.naturalKey)}</TableCell>
                    <TableCell>
                      <Badge variant={conflict.action === 'skip' ? 'secondary' : 'default'}>
                        {conflict.action === 'skip' ? 'Ignoré' : 'Mis à jour'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {summary.warnings.length > 0 && (
        <div className="space-y-2">
          {summary.warnings.map(warning => (
            <Alert key={warning} variant="default">
              <CheckCircle2 className="size-4" />
              <AlertTitle>{m.import_confirm_warnings()}</AlertTitle>
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        <Form method="post">
          <input type="hidden" name="storageKey" value={storageKey} />
          <SubmitButton>{m.import_confirm_submit()}</SubmitButton>
        </Form>
        <Button variant="outline" asChild>
          <Link to="/settings/data/import">{m.import_confirm_cancel()}</Link>
        </Button>
      </div>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.Admin)

  const currentUser = context.get(currentAccountContext)
  const formData = await request.formData()
  const storageKey = formData.get('storageKey') as string

  if (!storageKey) {
    throw redirect('/settings/data/import')
  }

  const job = await dataTransferQueue.add('import', {
    type: 'import',
    congregationId: currentUser.congregationId,
    userId: currentUser.id,
    storageKey,
  })

  return redirect(`/settings/data/import/${job.id}/status`)
}
