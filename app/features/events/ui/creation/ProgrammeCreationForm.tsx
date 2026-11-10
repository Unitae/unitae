import { FormSection, SegmentedControl } from '@unitae/ui'
import { Form, Link } from 'react-router'

import type { CreationTemplate, ExistingProgramme } from '~/features/events/model/programme-creation'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { SubmitButton } from '~/shared/ui/SubmitButton'

import { SeriesPreview, SinglePreview } from './CreationPreview'
import { CreationSeriesSections, FieldError } from './CreationSeriesSections'
import { CreationSingleSections } from './CreationSingleSections'
import { submitLabel } from './creation-labels'
import { type CreationMode, useProgrammeCreation } from './use-programme-creation'

/** What the action answers when it refuses: the form's errors, and the programme a taken day already has. */
export interface CreationActionData {
  result: { error?: Record<string, string[] | null> | null }
  existingId?: number
}

interface ProgrammeCreationFormProps {
  templates: CreationTemplate[]
  existing: ExistingProgramme[]
  today: string
  /** Manages every programme: « Autre évènement » and the way to the templates. */
  canManage: boolean
  week: string | null
  result: CreationActionData | undefined
}

/**
 * The creation page's form: the choices on the left, what they will create on the right, the save bar at the
 * bottom. Field names match `programmeCreationSchema`.
 */
export function ProgrammeCreationForm({
  templates,
  existing,
  today,
  canManage,
  week,
  result,
}: ProgrammeCreationFormProps) {
  const state = useProgrammeCreation({ templates, existing, today, canFreeform: canManage, week })
  const errors = result?.result.error ?? {}
  const series = state.mode === 'series'
  const mode = series ? 'series' : state.choice === 'freeform' ? 'freeform' : 'single'
  const ready = series ? state.count.create > 0 : state.choice != null

  return (
    <Form method="post" className="flex flex-col gap-4 pb-24">
      <input type="hidden" name="mode" value={mode} />
      {series && state.skippedKeys.map(key => <input key={key} type="hidden" name="skip" value={key} />)}
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_36rem] flex-col gap-6">
          <FormSection title={m.programs_new_mode_title()} description={m.programs_new_mode_description()}>
            <SegmentedControl<CreationMode>
              aria-label={m.programs_new_mode_title()}
              value={state.mode}
              onValueChange={state.setMode}
              className="col-span-full w-fit"
              options={[
                { value: 'series', label: m.programs_new_mode_series() },
                { value: 'single', label: m.programs_new_mode_single() },
              ]}
            />
          </FormSection>
          {series ? (
            <CreationSeriesSections state={state} errors={errors} today={today} canManage={canManage} />
          ) : (
            <CreationSingleSections
              state={state}
              templates={templates}
              errors={errors}
              today={today}
              canFreeform={canManage}
              existingId={result?.existingId}
            />
          )}
          <FieldError messages={errors['']} />
        </div>
        <aside className="min-w-0 flex-[1_1_18rem] lg:sticky lg:top-4">
          {series ? <SeriesPreview state={state} today={today} /> : <SinglePreview state={state} />}
        </aside>
      </div>
      <FormSaveBar
        changes={null}
        label={
          <>
            <span className="md:hidden">{m.programs_new_draft_note_short()}</span>
            <span className="max-md:hidden">{m.programs_new_draft_note()}</span>
          </>
        }
      >
        <Button asChild variant="ghost">
          <Link to="/programs">{m.common_cancel()}</Link>
        </Button>
        <SubmitButton disabled={!ready}>
          {series ? submitLabel(state.count.create) : m.programs_new_submit_single()}
        </SubmitButton>
      </FormSaveBar>
    </Form>
  )
}
