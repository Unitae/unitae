import * as m from '~/i18n/paraglide/messages'

/** What the privacy policy says depends on who runs the instance it is read on. */
export interface PrivacyInstance {
  /** The managed hosting: its processor, subprocessors, billing retention and transfers apply. */
  managedHosting: boolean
  operatorName: string | null
  /** Where data-protection requests go, when the operator gave an address. */
  privacyContact: string | null
  /** The operator's own policy, which complements this one. */
  privacyPolicyUrl: string | null
}

export interface PrivacySection {
  id: string
  number: string
  title: string
  body: React.ReactNode
}

// « 7. Sous-traitants » → 7 and « Sous-traitants »: the number is set apart, in the contents and the heading alike.
const TITLE_RE = /^(\d+)\.\s*(.*)$/

function section(index: number, title: string, body: React.ReactNode): PrivacySection {
  const [, number = String(index), text = title] = TITLE_RE.exec(title) ?? []
  return { id: `privacy-${index}`, number, title: text, body }
}

function Term({ term, details }: { term: string; details: string }) {
  return (
    <li>
      <strong className="font-medium">{term}</strong> : {details}
    </li>
  )
}

export function MailLink({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="text-brand-text underline-offset-4 hover:underline">
      {address}
    </a>
  )
}

export function OperatorPolicyLink({ instance }: { instance: PrivacyInstance }) {
  if (instance.privacyPolicyUrl == null) return null
  return (
    <a
      href={instance.privacyPolicyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="self-start text-brand-text underline-offset-4 hover:underline"
    >
      {m.privacy_operator_read()} ↗
    </a>
  )
}

/**
 * The twelve parts of the policy. What only holds for the managed hosting — its processor, subprocessors, billing
 * retention, transfers and contact — shows there only; any other instance is described as run by its operator.
 */
export function privacySections(instance: PrivacyInstance): PrivacySection[] {
  const { managedHosting, operatorName, privacyContact } = instance
  return [
    section(
      1,
      m.privacy_s1_title(),
      <>
        <p>{m.privacy_s1_p1()}</p>
        <p>
          {managedHosting
            ? m.privacy_s1_p2()
            : operatorName
              ? m.privacy_s1_p2_instance_named({ operator: operatorName })
              : m.privacy_s1_p2_instance()}
        </p>
      </>,
    ),
    section(
      2,
      m.privacy_s2_title(),
      <>
        <p>{m.privacy_s2_intro()}</p>
        <ul>
          <Term term={m.privacy_s2_identification()} details={m.privacy_s2_identification_details()} />
          <Term term={m.privacy_s2_contact()} details={m.privacy_s2_contact_details()} />
          <Term term={m.privacy_s2_demographics()} details={m.privacy_s2_demographics_details()} />
          <Term term={m.privacy_s2_religious()} details={m.privacy_s2_religious_details()} />
          <Term term={m.privacy_s2_activity()} details={m.privacy_s2_activity_details()} />
          <Term term={m.privacy_s2_technical()} details={m.privacy_s2_technical_details()} />
        </ul>
      </>,
    ),
    section(
      3,
      m.privacy_s3_title(),
      <>
        <p>{m.privacy_s3_p1()}</p>
        <p>{m.privacy_s3_p2()}</p>
      </>,
    ),
    section(
      4,
      m.privacy_s4_title(),
      <ul>
        <Term term={m.privacy_s4_contract()} details={m.privacy_s4_contract_details()} />
        <Term term={m.privacy_s4_legitimate()} details={m.privacy_s4_legitimate_details()} />
        <Term term={m.privacy_s4_legal()} details={m.privacy_s4_legal_details()} />
        <Term term={m.privacy_s4_consent()} details={m.privacy_s4_consent_details()} />
      </ul>,
    ),
    section(
      5,
      m.privacy_s5_title(),
      <ul>
        <li>{m.privacy_s5_purpose_1()}</li>
        <li>{m.privacy_s5_purpose_2()}</li>
        <li>{m.privacy_s5_purpose_3()}</li>
        <li>{m.privacy_s5_purpose_4()}</li>
        <li>{m.privacy_s5_purpose_5()}</li>
        <li>{m.privacy_s5_purpose_6()}</li>
        <li>{m.privacy_s5_purpose_7()}</li>
      </ul>,
    ),
    section(
      6,
      m.privacy_s6_title(),
      <ul>
        <li>{m.privacy_s6_users()}</li>
        <li>{m.privacy_s6_activity()}</li>
        <li>{m.privacy_s6_attributions()}</li>
        <li>{m.privacy_s6_documents()}</li>
        <li>{m.privacy_s6_session()}</li>
        <li>{m.privacy_s6_tokens()}</li>
        <li>{m.privacy_s6_consent()}</li>
        {managedHosting && <li>{m.privacy_s6_billing()}</li>}
      </ul>,
    ),
    section(7, m.privacy_s7_title(), managedHosting ? <ManagedSubprocessors /> : <InstanceProviders {...instance} />),
    section(
      8,
      m.privacy_s8_title(),
      <>
        <p>{m.privacy_s8_intro()}</p>
        <ul>
          <Term term={m.privacy_s8_access()} details={m.privacy_s8_access_details()} />
          <Term term={m.privacy_s8_rectification()} details={m.privacy_s8_rectification_details()} />
          <Term term={m.privacy_s8_erasure()} details={m.privacy_s8_erasure_details()} />
          <Term term={m.privacy_s8_portability()} details={m.privacy_s8_portability_details()} />
          <Term term={m.privacy_s8_restriction()} details={m.privacy_s8_restriction_details()} />
          <Term term={m.privacy_s8_opposition()} details={m.privacy_s8_opposition_details()} />
          <Term term={m.privacy_s8_withdraw()} details={m.privacy_s8_withdraw_details()} />
        </ul>
        {managedHosting ? (
          <p>{m.privacy_s8_exercise()}</p>
        ) : (
          <p>
            {m.privacy_s8_exercise_instance()}
            {privacyContact && (
              <>
                {' '}
                {m.privacy_s8_exercise_instance_contact()} <MailLink address={privacyContact} />
              </>
            )}
          </p>
        )}
      </>,
    ),
    section(
      9,
      m.privacy_s9_title(),
      <>
        <p>{m.privacy_s9_intro()}</p>
        <ul>
          <li>{m.privacy_s9_tls()}</li>
          <li>{m.privacy_s9_hashing()}</li>
          <li>{m.privacy_s9_rls()}</li>
          <li>{m.privacy_s9_rbac()}</li>
          <li>{m.privacy_s9_cookies()}</li>
          <li>{m.privacy_s9_rate_limit()}</li>
        </ul>
      </>,
    ),
    section(
      10,
      m.privacy_s10_title(),
      <>
        <p>{m.privacy_s10_p1()}</p>
        <p>{m.privacy_s10_p1b()}</p>
        <p>{m.privacy_s10_p2()}</p>
      </>,
    ),
    section(11, m.privacy_s11_title(), <p>{m.privacy_s11_text()}</p>),
    section(12, m.privacy_s12_title(), <p>{m.privacy_s12_text()}</p>),
  ]
}

function ManagedSubprocessors() {
  return (
    <>
      <p>{m.privacy_s7_intro()}</p>
      <ul>
        <li>
          <strong className="font-medium">{m.privacy_s7_ovh()}</strong> ({m.privacy_s7_ovh_location()}) —{' '}
          {m.privacy_s7_ovh_service()}
        </li>
        <li>
          <strong className="font-medium">{m.privacy_s7_resend()}</strong> ({m.privacy_s7_resend_location()}) —{' '}
          {m.privacy_s7_resend_service()}
        </li>
        <li>
          <strong className="font-medium">{m.privacy_s7_stripe()}</strong> ({m.privacy_s7_stripe_location()}) —{' '}
          {m.privacy_s7_stripe_service()}
        </li>
        <li>
          <strong className="font-medium">{m.privacy_s7_google()}</strong> ({m.privacy_s7_google_location()}) —{' '}
          {m.privacy_s7_google_service()}
        </li>
      </ul>
      <p>{m.privacy_s7_transfers()}</p>
    </>
  )
}

function InstanceProviders(instance: PrivacyInstance) {
  return (
    <>
      <p>
        {m.privacy_s7_instance()}{' '}
        {instance.privacyContact ? (
          <>
            {m.privacy_s7_instance_ask_contact()} <MailLink address={instance.privacyContact} />
          </>
        ) : (
          m.privacy_s7_instance_ask()
        )}
      </p>
      <OperatorPolicyLink instance={instance} />
    </>
  )
}
