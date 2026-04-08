import { data, Form, redirect } from 'react-router'

import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'
import { unscopedDb } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/edit-congregation'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Modifier une congrégation - Unitae Admin' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifyPlatformAdmin(request)

  const congregation = await unscopedDb.congregation.findUnique({
    where: { id: requireParamId(params.congregationId, '/platform-admin/congregations') },
    include: {
      _count: { select: { users: true, territories: true, buildings: true } },
    },
  })

  if (!congregation) throw redirect('/platform-admin/congregations')

  return {
    congregation: {
      id: congregation.id,
      name: congregation.name,
      slug: congregation.slug,
      domain: congregation.domain,
      displayName: congregation.displayName,
      emailFromName: congregation.emailFromName,
      emailFromAddress: congregation.emailFromAddress,
      baseUrl: congregation.baseUrl,
      locale: congregation.locale,
      timezone: congregation.timezone,
      active: congregation.active,
      stats: congregation._count,
    },
  }
}

export default function EditCongregationPage({ loaderData }: Route.ComponentProps) {
  const { congregation } = loaderData

  return (
    <div className="max-w-2xl">
      <h2 className="mb-6 font-bold text-2xl">{congregation.name}</h2>

      <div className="mb-6 flex gap-4 text-sm text-gray-500">
        <span>{congregation.stats.users} utilisateurs</span>
        <span>{congregation.stats.territories} territoires</span>
        <span>{congregation.stats.buildings} bâtiments</span>
      </div>

      <Form method="post" className="flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Nom
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={congregation.name}
            required
            className="mt-1 block w-full rounded-md border-0 px-3 py-2 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            defaultValue={congregation.slug}
            required
            className="mt-1 block w-full rounded-md border-0 px-3 py-2 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div>
          <label htmlFor="domain" className="block text-sm font-medium">
            Domaine personnalisé
          </label>
          <input
            id="domain"
            name="domain"
            type="text"
            defaultValue={congregation.domain ?? ''}
            className="mt-1 block w-full rounded-md border-0 px-3 py-2 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium">
            Nom d'affichage
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            defaultValue={congregation.displayName ?? ''}
            className="mt-1 block w-full rounded-md border-0 px-3 py-2 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div className="flex items-center gap-2">
          <input id="active" name="active" type="checkbox" defaultChecked={congregation.active} />
          <label htmlFor="active" className="text-sm font-medium">
            Active
          </label>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-md bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-900"
        >
          Enregistrer
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  await verifyPlatformAdmin(request)

  const form = await request.formData()
  const congregationId = requireParamId(params.congregationId, '/platform-admin/congregations')

  await unscopedDb.congregation.update({
    where: { id: congregationId },
    data: {
      name: String(form.get('name')),
      slug: String(form.get('slug')),
      domain: String(form.get('domain')) || null,
      displayName: String(form.get('displayName')) || null,
      active: form.get('active') === 'on',
    },
  })

  return redirect('/platform-admin/congregations')
}
