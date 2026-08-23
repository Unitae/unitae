import { z } from 'zod'
import {
  CampaignRegularEndAction,
  CampaignRegularStartAction,
} from '~/features/territories/model/campaign-lifecycle.type'
import * as m from '~/i18n/paraglide/messages'

export const campaignSchema = z
  .object({
    name: z.string().min(1),
    notes: z.string().optional().default(''),
    'start-date': z.string().min(1),
    'end-date': z.string().min(1),
    'rest-period-days': z.coerce.number().int().positive().optional(),
    'start-regular-action': z.nativeEnum(CampaignRegularStartAction),
    'start-auto-reassign': z.boolean().optional().default(false),
    'end-close-campaign': z.boolean().optional().default(false),
    'end-regular-action': z.nativeEnum(CampaignRegularEndAction),
    scope: z.array(z.coerce.number()).optional().default([]),
  })
  .refine(value => value['end-date'] >= value['start-date'], {
    message: m.campaigns_dates_error(),
    path: ['end-date'],
  })
  .refine(
    value => !(value['start-auto-reassign'] && value['start-regular-action'] !== CampaignRegularStartAction.Pause),
    {
      // Auto-reassign only makes sense when regulars are paused (§12.4).
      message: m.campaigns_leave_reassign_error(),
      path: ['start-auto-reassign'],
    },
  )

export type CampaignInput = z.infer<typeof campaignSchema>
