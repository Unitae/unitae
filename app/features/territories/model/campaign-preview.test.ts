import { describe, expect, it } from 'vitest'
import { previewCampaignLifecycle } from './campaign-preview'

const base = {
  startRegularAction: 'Pause',
  startAutoReassign: false,
  endCloseCampaign: true,
  endRegularAction: 'Resume',
} as const

describe('previewCampaignLifecycle', () => {
  it('Pause without auto-reassign', () => {
    expect(previewCampaignLifecycle(base)).toEqual({
      start: ['pause'],
      end: ['close-campaign', 'resume'],
    })
  })

  it('Pause with auto-reassign', () => {
    expect(previewCampaignLifecycle({ ...base, startAutoReassign: true }).start).toEqual(['pause', 'reassign'])
  })

  it('Close start action', () => {
    expect(previewCampaignLifecycle({ ...base, startRegularAction: 'Close' }).start).toEqual(['close'])
  })

  it('Leave start action ignores auto-reassign (validated away upstream)', () => {
    expect(previewCampaignLifecycle({ ...base, startRegularAction: 'Leave', startAutoReassign: true }).start).toEqual([
      'leave',
    ])
  })

  it('end without auto-close, keeping paused', () => {
    expect(previewCampaignLifecycle({ ...base, endCloseCampaign: false, endRegularAction: 'KeepPaused' }).end).toEqual([
      'leave-campaign-open',
      'keep-paused',
    ])
  })

  it('end closing the paused regulars', () => {
    expect(previewCampaignLifecycle({ ...base, endRegularAction: 'Close' }).end).toEqual([
      'close-campaign',
      'close-regulars',
    ])
  })
})
