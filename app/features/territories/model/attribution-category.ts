// Filter/stats vocabulary for the two-layer model: campaign is a layer
// (`Attribution.campaignId`), no longer a `type` value, but users still think
// in three buckets — door-to-door, phone, campaign. URL params keep the
// historical values so saved links stay valid.
export const AttributionCategory = {
  Default: 'Default',
  Phone: 'Phone',
  Campaign: 'Campaign',
} as const

export type AttributionCategory = (typeof AttributionCategory)[keyof typeof AttributionCategory]
