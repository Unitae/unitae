export interface CampaignLifecyclePreview {
  start: ('pause' | 'reassign' | 'close' | 'leave')[]
  end: ('close-campaign' | 'leave-campaign-open' | 'resume' | 'keep-paused' | 'close-regulars')[]
}

/**
 * Pure summary of what the configured options will do at the campaign's start
 * and end — the form renders it as prose so the servant sees the consequences
 * before saving.
 */
export function previewCampaignLifecycle(options: {
  startRegularAction: string
  startAutoReassign: boolean
  endCloseCampaign: boolean
  endRegularAction: string
}): CampaignLifecyclePreview {
  const start: CampaignLifecyclePreview['start'] = []
  if (options.startRegularAction === 'Pause') {
    start.push('pause')
    if (options.startAutoReassign) start.push('reassign')
  } else if (options.startRegularAction === 'Close') {
    start.push('close')
  } else {
    start.push('leave')
  }

  const end: CampaignLifecyclePreview['end'] = [options.endCloseCampaign ? 'close-campaign' : 'leave-campaign-open']
  if (options.endRegularAction === 'Resume') end.push('resume')
  else if (options.endRegularAction === 'KeepPaused') end.push('keep-paused')
  else end.push('close-regulars')

  return { start, end }
}
