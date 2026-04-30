import { Link } from 'react-router'
import * as m from '~/paraglide/messages'

import type { Route } from './+types/privacy'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Politique de confidentialité - Unitae' }]
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="mb-8 inline-block text-blue-600 text-sm hover:text-blue-800">
        &larr; {m.privacy_back()}
      </Link>

      <h1 className="mb-8 font-bold text-3xl text-gray-900">{m.privacy_title()}</h1>
      <p className="mb-6 text-gray-500 text-sm">{m.privacy_last_updated()}</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s1_title()}</h2>
          <p>{m.privacy_s1_p1()}</p>
          <p className="mt-2">{m.privacy_s1_p2()}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s2_title()}</h2>
          <p>{m.privacy_s2_intro()}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>{m.privacy_s2_identification()}</strong> : {m.privacy_s2_identification_details()}
            </li>
            <li>
              <strong>{m.privacy_s2_contact()}</strong> : {m.privacy_s2_contact_details()}
            </li>
            <li>
              <strong>{m.privacy_s2_demographics()}</strong> : {m.privacy_s2_demographics_details()}
            </li>
            <li>
              <strong>{m.privacy_s2_religious()}</strong> : {m.privacy_s2_religious_details()}
            </li>
            <li>
              <strong>{m.privacy_s2_activity()}</strong> : {m.privacy_s2_activity_details()}
            </li>
            <li>
              <strong>{m.privacy_s2_technical()}</strong> : {m.privacy_s2_technical_details()}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s3_title()}</h2>
          <p>{m.privacy_s3_p1()}</p>
          <p className="mt-2">{m.privacy_s3_p2()}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s4_title()}</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>{m.privacy_s4_contract()}</strong> : {m.privacy_s4_contract_details()}
            </li>
            <li>
              <strong>{m.privacy_s4_legitimate()}</strong> : {m.privacy_s4_legitimate_details()}
            </li>
            <li>
              <strong>{m.privacy_s4_legal()}</strong> : {m.privacy_s4_legal_details()}
            </li>
            <li>
              <strong>{m.privacy_s4_consent()}</strong> : {m.privacy_s4_consent_details()}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s5_title()}</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>{m.privacy_s5_purpose_1()}</li>
            <li>{m.privacy_s5_purpose_2()}</li>
            <li>{m.privacy_s5_purpose_3()}</li>
            <li>{m.privacy_s5_purpose_4()}</li>
            <li>{m.privacy_s5_purpose_5()}</li>
            <li>{m.privacy_s5_purpose_6()}</li>
            <li>{m.privacy_s5_purpose_7()}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s6_title()}</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>{m.privacy_s6_users()}</li>
            <li>{m.privacy_s6_activity()}</li>
            <li>{m.privacy_s6_attributions()}</li>
            <li>{m.privacy_s6_documents()}</li>
            <li>{m.privacy_s6_session()}</li>
            <li>{m.privacy_s6_tokens()}</li>
            <li>{m.privacy_s6_consent()}</li>
            <li>{m.privacy_s6_billing()}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s7_title()}</h2>
          <p>{m.privacy_s7_intro()}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>{m.privacy_s7_ovh()}</strong> ({m.privacy_s7_ovh_location()}) — {m.privacy_s7_ovh_service()}
            </li>
            <li>
              <strong>{m.privacy_s7_resend()}</strong> ({m.privacy_s7_resend_location()}) —{' '}
              {m.privacy_s7_resend_service()}
            </li>
            <li>
              <strong>{m.privacy_s7_stripe()}</strong> ({m.privacy_s7_stripe_location()}) —{' '}
              {m.privacy_s7_stripe_service()}
            </li>
            <li>
              <strong>{m.privacy_s7_google()}</strong> ({m.privacy_s7_google_location()}) —{' '}
              {m.privacy_s7_google_service()}
            </li>
          </ul>
          <p className="mt-2">{m.privacy_s7_transfers()}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s8_title()}</h2>
          <p>{m.privacy_s8_intro()}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>{m.privacy_s8_access()}</strong> : {m.privacy_s8_access_details()}
            </li>
            <li>
              <strong>{m.privacy_s8_rectification()}</strong> : {m.privacy_s8_rectification_details()}
            </li>
            <li>
              <strong>{m.privacy_s8_erasure()}</strong> : {m.privacy_s8_erasure_details()}
            </li>
            <li>
              <strong>{m.privacy_s8_portability()}</strong> : {m.privacy_s8_portability_details()}
            </li>
            <li>
              <strong>{m.privacy_s8_restriction()}</strong> : {m.privacy_s8_restriction_details()}
            </li>
            <li>
              <strong>{m.privacy_s8_opposition()}</strong> : {m.privacy_s8_opposition_details()}
            </li>
            <li>
              <strong>{m.privacy_s8_withdraw()}</strong> : {m.privacy_s8_withdraw_details()}
            </li>
          </ul>
          <p className="mt-2">{m.privacy_s8_exercise()}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s9_title()}</h2>
          <p>{m.privacy_s9_intro()}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>{m.privacy_s9_tls()}</li>
            <li>{m.privacy_s9_hashing()}</li>
            <li>{m.privacy_s9_rls()}</li>
            <li>{m.privacy_s9_rbac()}</li>
            <li>{m.privacy_s9_cookies()}</li>
            <li>{m.privacy_s9_rate_limit()}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s10_title()}</h2>
          <p>{m.privacy_s10_p1()}</p>
          <p className="mt-2">{m.privacy_s10_p2()}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s11_title()}</h2>
          <p>{m.privacy_s11_text()}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">{m.privacy_s12_title()}</h2>
          <p>{m.privacy_s12_text()}</p>
        </section>
      </div>
    </div>
  )
}
