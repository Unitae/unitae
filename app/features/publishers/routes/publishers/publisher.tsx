import { ArchiveBoxIcon, ArrowDownTrayIcon, IdentificationIcon, PencilIcon } from '@heroicons/react/24/outline'
import { Form, Link, redirect } from 'react-router'
import { sanitizeUser } from '~/features/authentication/server/sanitize-user.server'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { PublisherActivityDownloadLink } from '~/features/publishers/ui/PublisherActivityDownloadLink'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { HeroHeader } from '~/shared/ui/HeroHeader'

import type { Route } from './+types/publisher'

export const meta: Route.MetaFunction = ({ data }) => {
  return [{ title: `${data.publisher.firstname} ${data.publisher.lastname} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, session } = await verifySession(request)
  const canViewPublisher = await verifyRole(request, Role.PublisherViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canManageActivity = await verifyRole(request, Role.ActivityManager)

  if (!canViewPublisher) {
    logger.warn(`Tried to load publisher file. User ID: ${currentUser.id}. Does NOT have rights to view publishers.`)
    throw redirect('/')
  }

  logger.info(
    `Loading publisher file for ${params.publisherId}. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage publishers.`,
  )

  const today = new Date()
  const yearBegining = new Date(today.getFullYear(), 8, 1)
  if (today < yearBegining) {
    yearBegining.setFullYear(today.getFullYear() - 1)
  }
  const publisher = await db.user.findUnique({
    where: { id: requireParamId(params.publisherId, '/congregation/publishers') },
    include: {
      publisherGroup: {
        include: {
          responsible: true,
          deputy: true,
        },
      },
      activities: {
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma syntax
          OR: [
            {
              year: yearBegining.getFullYear(),
              month: {
                gte: 8,
              },
            },
            {
              year: yearBegining.getFullYear() + 1,
              month: {
                lte: 11,
              },
            },
          ],
        },
      },
    },
  })

  if (!publisher) {
    throw redirect('/congregation/publishers')
  }

  const messages = { success: session.get('success'), error: session.get('error') }

  return {
    publisher: sanitizeUser(publisher),
    messages,
    roles: {
      canViewPublisher,
      canManagePublisher,
      canManageActivity:
        canManageActivity ||
        publisher.publisherGroup?.responsible.id === currentUser.id ||
        publisher.publisherGroup?.deputy.id === currentUser.id,
    },
  }
}

export default function PublisherPage({ loaderData }: Route.ComponentProps) {
  const { publisher, messages, roles } = loaderData

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <HeroHeader
        title={`${publisher.firstname} ${publisher.lastname}`}
        subtitle="Fiche du proclamateur. Elle affiche les informations liées à ce proclamateur et auxquelles vous avez accès."
        actions={
          roles.canManagePublisher && (
            <>
              {roles.canManageActivity && (
                <PublisherActivityDownloadLink publisher={publisher}>
                  <span
                    className="inline-block rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2"
                    title="Télécharger la fiche d'activité (S-21)"
                  >
                    <ArrowDownTrayIcon className="inline size-6" />
                  </span>
                </PublisherActivityDownloadLink>
              )}
              <Link
                to="../edit"
                relative="path"
                title="Modifier le proclamateur"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                <PencilIcon className="inline size-6 max-sm:size-5" />
              </Link>
              {publisher.isPublisher ? (
                <Form method="post" action={`/settings/users/${publisher.id}/unmake-publisher`}>
                  <button
                    type="submit"
                    title="Désactiver la fiche proclamateur. L'utilisateur ne sera plus proclamateur dans cette assemblée."
                    className={'rounded-lg bg-gray-500 p-3 font-semibold text-white hover:bg-gray-700 max-sm:p-2'}
                  >
                    <ArchiveBoxIcon className={'inline size-6 max-sm:size-5'} />
                  </button>
                </Form>
              ) : (
                <Form method="post" action={`/settings/users/${publisher.id}/make-publisher`}>
                  <button
                    type="submit"
                    title="Activer la fiche proclamateur. L'utilisateur sera proclamateur dans cette assemblée."
                    className={'rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2'}
                  >
                    <IdentificationIcon className={'inline size-6 max-sm:size-5'} />
                  </button>
                </Form>
              )}
            </>
          )
        }
      />

      <section className="flex flex-row gap-3 rounded-md bg-gray-900 p-5 text-white max-sm:flex-col">
        <div className="flex flex-1/2 flex-col gap-3">
          <p>
            Genre : <span className="text-teal-600">{publisher.isMale ? 'Homme' : 'Femme'}</span>
          </p>
          <p>
            Date de naissance :{' '}
            <span className="text-teal-600">
              {publisher.birthDate?.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })}
            </span>
          </p>
          {publisher.baptismDate != null && (
            <p>
              Date de baptême :{' '}
              <span className="text-teal-600">
                {publisher.baptismDate?.toLocaleDateString('fr-FR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </span>
            </p>
          )}
        </div>
        {publisher.baptismDate != null && (
          <div className="flex flex-1/2 flex-col gap-3">
            <p>
              Oint : <span className="text-teal-600">{publisher.isAnointed ? 'Oui' : 'Non'}</span>
            </p>
            {publisher.isMale && (
              <>
                <p>
                  Ancien : <span className="text-teal-600">{publisher.isHelder ? 'Oui' : 'Non'}</span>
                </p>
                <p>
                  Assistant : <span className="text-teal-600">{publisher.isServant ? 'Oui' : 'Non'}</span>
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md bg-gray-900 p-5 text-white">
        <h2 className="mb-4 text-xl">Informations de contact</h2>
        <p>
          Adresse postale : <span className="text-teal-600">{publisher.address ? publisher.address : '...'}</span>
        </p>
        <p>
          Téléphone : <span className="text-teal-600">{publisher.phone ? publisher.phone : '...'}</span>
        </p>
        {!publisher.email.includes('@placeholder.unitae.app') && (
          <p>
            Adresse email :{' '}
            <Link to={`mailto:${publisher.email}`} className="text-teal-600">
              {publisher.email}
            </Link>
          </p>
        )}
        <p className="pt-5 text-sm italic">
          Si certaines de ces informations ne sont pas bonnes, merci de contacter le secrétaire.
        </p>
      </section>
    </div>
  )
}
