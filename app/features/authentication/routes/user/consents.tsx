import { redirect } from 'react-router'

/** The consents moved into « Mon compte › Confidentialité ». */
export function loader() {
  throw redirect('/me/privacy')
}
