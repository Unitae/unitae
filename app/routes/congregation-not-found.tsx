import * as m from '~/paraglide/messages'

import type { Route } from './+types/congregation-not-found'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Assemblée non trouvée - Unitae' }]
}

export default function CongregationNotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-4 font-bold text-2xl text-gray-900">{m.congregation_not_found_title()}</h1>
        <p className="mb-6 text-gray-600">{m.congregation_not_found_message()}</p>
      </div>
    </div>
  )
}
