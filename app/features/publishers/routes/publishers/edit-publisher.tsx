import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { toServiceYear } from '~/features/publishers'
import { getEnrolmentsForMember, resolvePioneerGoal } from '~/features/publishers/index.server'
import { enrolmentMonthOptions, findActiveStandingEnrolment } from '~/features/publishers/model/pioneer-enrolment-form'
import type { EnrolmentMonthOption } from '~/features/publishers/model/pioneer-enrolment-form.type'
import { updatePublisherSchema } from '~/features/publishers/schemas/edit-publisher.schema'
import { updateMember } from '~/features/publishers/server/update-member.server'
import PioneerEnrolmentFields from '~/features/publishers/ui/PioneerEnrolmentFields'
import PublisherEditActions from '~/features/publishers/ui/PublisherEditActions'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'
import { PublisherType } from '~/shared/types/publisher-type'
import { FormActions } from '~/shared/ui/FormActions'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'
import { handlePioneerEnrolmentIntent, PIONEER_ENROLMENT_INTENTS } from './_pioneer-enrolment-action.server'
import type { Route } from './+types/edit-publisher'

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublishers)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const result = await db.member.findUnique({
      where: {
        id_congregationId: {
          id: requireParamId(params.publisherId, '/publishers'),
          congregationId: currentUser.congregationId,
        },
      },
      include: { account: { select: { email: true } } },
    })

    if (result == null) throw redirect('/publishers')

    const showAuxiliaryPioneer = await getBoolSetting(
      db,
      CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated,
      currentUser.congregationId,
    )
    const groups = await db.publisherGroup.findMany({ where: { congregationId: currentUser.congregationId } })
    const enrolments = await getEnrolmentsForMember(db, result.id, currentUser.congregationId)
    const activeStanding = findActiveStandingEnrolment(enrolments)

    // The monthly-auxiliary goal is seeded from the congregation's configured auxiliary rate and
    // then frozen onto the enrolment. That rate is per service year and the two selectable months
    // can straddle the September boundary, so resolve one rate per month option rather than once
    // for "now". Two iterations, so the sequential await costs nothing worth parallelising.
    const monthOptions: EnrolmentMonthOption[] = []
    for (const option of enrolmentMonthOptions(new Date())) {
      const serviceYear = toServiceYear(option.month, option.year)
      const auxiliaryGoal = await resolvePioneerGoal(db, serviceYear, PublisherType.PionnierAuxiliaires)
      monthOptions.push({ ...option, auxiliaryGoal })
    }
    const { account, ...member } = result
    return {
      user: {
        ...member,
        hasLogin: account != null,
      },
      groups,
      hideAuxiliaryPioneer: !showAuxiliaryPioneer,
      activeStanding: activeStanding
        ? {
            id: activeStanding.id,
            type: activeStanding.type,
            startMonth: activeStanding.startMonth,
            startYear: activeStanding.startYear,
          }
        : null,
      enrolments: enrolments.map(e => ({
        id: e.id,
        type: e.type,
        startMonth: e.startMonth,
        startYear: e.startYear,
        endMonth: e.endMonth,
        endYear: e.endYear,
        monthlyGoal: e.monthlyGoal,
      })),
      monthOptions,
      yearOptions: YEAR_OPTIONS,
    }
  })
}

export default function EditPublisher({ loaderData }: Route.ComponentProps) {
  const { user, groups, hideAuxiliaryPioneer, activeStanding, enrolments, monthOptions, yearOptions } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  const [gender, setGender] = useState<'male' | 'female' | null>(user.isMale ? 'male' : 'female')

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.publishers_edit_title()}
        subtitle={m.publishers_edit_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publishers(), to: '/publishers' }, { label: m.publishers_edit_title() }]}
        backTo="/publishers"
        actions={<PublisherEditActions user={user} />}
      />

      {/* Member identity + group — the pioneer type is managed by the enrolment forms below, so the
          field-service form submits it as a read-only hidden value. Its submit button lives at the
          bottom (via the form id) so the pioneer card isn't orphaned under a terminal button. */}
      <Form id="edit-publisher-form" method="post" className="flex flex-col gap-6" onChange={markDirty}>
        <PublisherPersonalInformationForm user={user} onGenderChange={setGender} />
        <PublisherNominationForm user={user} gender={gender} />
        <PublisherFieldServiceForm
          user={user}
          groups={groups}
          hideAuxiliaryPioneer={hideAuxiliaryPioneer}
          hideTypeSelect
        />
      </Form>

      {/* Pioneer appointments — separate forms, each posting its own enrolment intent (saved on their
          own buttons, independently of the identity form below). */}
      <PioneerEnrolmentFields
        activeStanding={activeStanding}
        enrolments={enrolments}
        monthOptions={monthOptions}
        yearOptions={yearOptions}
        hidePermanentAuxiliary={hideAuxiliaryPioneer}
      />

      <FormActions>
        <SubmitButton form="edit-publisher-form" size="lg">
          {m.publishers_edit_submit()}
        </SubmitButton>
      </FormActions>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const formData = await request.formData()

  // Pioneer appointment forms post a dedicated intent; everything else is a member update.
  const intent = formData.get('intent')
  if (typeof intent === 'string' && PIONEER_ENROLMENT_INTENTS.includes(intent)) {
    return handlePioneerEnrolmentIntent(request, params, context, formData)
  }

  const submission = parseWithZod(formData, { schema: updatePublisherSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const {
    firstname,
    lastname,
    email,
    gender,
    birthDate,
    baptismDate,
    isHelder,
    isServant,
    isAnointed,
    group,
    type,
    phone,
    address,
  } = submission.value
  const previousPage = request.headers.get('referer')

  return withScopeFromContext(context, async db => {
    const user = await updateMember(
      db,
      requireParamId(params.publisherId, '/publishers'),
      currentUser.congregationId,
      currentUser.id,
      {
        firstname,
        lastname,
        gender,
        baptismDate: baptismDate || null,
        birthDate: birthDate || null,
        isHelder,
        isServant,
        isAnointed,
        groupId: group ?? null,
        email: email ?? '',
        type,
        address,
        phone,
      },
    )
    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.publishers_edit_success({ name: user.firstname ?? '' }))
    return redirect(previousPage ?? `/publishers/${user.id}`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
