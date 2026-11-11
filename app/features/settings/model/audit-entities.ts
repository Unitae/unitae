import * as m from '~/i18n/paraglide/messages'

/** What each kind of object the audit log names is called, by the model name the audit row stores. */
const ENTITY_LABEL: Record<string, () => string> = {
  Attribution: m.audit_log_entity_attribution,
  BoardDocument: m.audit_log_entity_board_document,
  BoardDynamicDocumentSettings: m.audit_log_entity_dynamic_document,
  BoardSection: m.audit_log_entity_board_section,
  Building: m.audit_log_entity_building,
  BuildingEntrance: m.audit_log_entity_building_entrance,
  BuildingSync: m.audit_log_entity_building_sync,
  Campaign: m.audit_log_entity_campaign,
  Congregation: m.audit_log_entity_congregation,
  Event: m.audit_log_entity_event,
  EventPart: m.audit_log_entity_event_part,
  EventServicePart: m.audit_log_entity_event_service,
  EventTemplate: m.audit_log_entity_event_template,
  ExternalSpeaker: m.audit_log_entity_external_speaker,
  Member: m.audit_log_entity_member,
  PartPreset: m.audit_log_entity_part_preset,
  PioneerEnrolment: m.audit_log_entity_pioneer_enrolment,
  PioneerGoal: m.audit_log_entity_pioneer_goal,
  PublisherActivity: m.audit_log_entity_publisher_activity,
  PublisherGroup: m.audit_log_entity_publisher_group,
  Role: m.audit_log_entity_role,
  TemplatePart: m.audit_log_entity_template_part,
  TemplateServicePart: m.audit_log_entity_template_service,
  Territory: m.audit_log_entity_territory,
  TerritoryCardOverlay: m.audit_log_entity_card_overlay,
  TerritoryKind: m.audit_log_entity_territory_kind,
  TerritoryPerimeter: m.audit_log_entity_perimeter,
  User: m.audit_log_entity_user,
  UserAccount: m.audit_log_entity_user,
}

/** The object an audit row is about, as « Rôle #12 »; the congregation needs no number, a row about nothing a dash. */
export function auditEntityLabel(entityType: string | null, entityId: number | null): string {
  if (!entityType) return '—'
  const label = ENTITY_LABEL[entityType]?.() ?? entityType
  return entityId == null || entityType === 'Congregation' ? label : `${label} #${entityId}`
}
