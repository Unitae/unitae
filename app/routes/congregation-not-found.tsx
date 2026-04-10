import type { Route } from './+types/congregation-not-found'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Assemblée non trouvée - Unitae' }]
}

export default function CongregationNotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-4 font-bold text-2xl text-gray-900">Assemblée non trouvée</h1>
        <p className="mb-6 text-gray-600">
          L'assemblée locale que vous recherchez n'existe pas ou n'est plus disponible.
        </p>
      </div>
    </div>
  )
}
