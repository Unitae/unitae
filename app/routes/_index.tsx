import { redirect } from 'react-router'

import type { Route } from './+types/_index'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Unitae' }]
}

export function loader() {
  return redirect('/board')
}
