import { redirect } from 'react-router'

export function loader() {
  return redirect('/settings/users')
}

export default function Index() {
  return null
}
