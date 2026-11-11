import * as m from '~/i18n/paraglide/messages'

/** The kinds of data an archive holds, as the import summary names them. */
const ENTITY_LABELS: Record<string, () => string> = {
  congregation: () => m.data_transfer_entity_congregation(),
  settings: () => m.data_transfer_entity_settings(),
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

/** What an archive's kind of data is called; its file name when the catalogue has no word for it. */
export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity]?.() ?? entity
}
