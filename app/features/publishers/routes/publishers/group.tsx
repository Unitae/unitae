import { BarChart3, Eye, Mail, Pencil, Plus } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { commitSession, getSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getGroup } from '~/features/publishers/server/groups'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/group'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canManageActivity = await verifyRole(request, Role.ActivityManager)

  if (!canViewPublishers) {
    throw redirect('/')
  }

  const group = await getGroup(requireParamId(params.groupId, '/congregation/publisher-groups'))
  if (group == null) {
    throw redirect('/congregation/publisher-groups/')
  }

  return {
    group,
    roles: {
      canManagePublisher,
      canViewPublishers,
      canManageActivity:
        canManageActivity || group.responsible.id === currentUser.id || group.deputy?.id === currentUser.id,
    },
  }
}

export default function ViewGroup({ loaderData }: Route.ComponentProps) {
  const { group, roles } = loaderData

  const today = new Date()
  const lastMonth = new Date()
  lastMonth.setMonth(today.getMonth() - 1)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={group.name.toLocaleUpperCase()}
        subtitle="Toutes les informations disponibles sur ce groupe de prédication sont visualisables sur cette page"
        actions={
          roles.canManagePublisher && (
            <Button asChild variant="outline" size="icon" title="Modifier le groupe de prédication">
              <Link to={'../edit'} relative="path">
                <Pencil className="size-4" />
              </Link>
            </Button>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Informations du groupe</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Responsable :{' '}
            <Link
              to={`../../../publishers/${group.responsible.id}/view`}
              relative="path"
              className="font-medium text-primary hover:underline"
            >
              {group.responsible.firstname} {group.responsible.lastname?.toLocaleUpperCase()}
            </Link>
          </p>
          <p className="text-muted-foreground text-sm">
            Adjoint au responsable :{' '}
            {group.deputy ? (
              <Link
                to={`../../../publishers/${group.deputy.id}/view`}
                relative="path"
                className="font-medium text-primary hover:underline"
              >
                {group.deputy.firstname} {group.deputy.lastname?.toLocaleUpperCase()}
              </Link>
            ) : (
              <span className="font-medium text-foreground">Aucun</span>
            )}
          </p>
          <p className="text-muted-foreground text-sm">
            Adresse : <span className="font-medium text-foreground">{group.address}</span>
          </p>
          <Separator className="my-2" />
          <p className="text-muted-foreground text-xs italic">
            Si certaines de ces informations ne sont pas bonnes, merci de contacter le secrétaire.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="font-bold font-display text-2xl tracking-tight">Membres du groupe</h2>
        <p className="text-muted-foreground text-sm">Liste de tous les membres de ce groupe de prédication</p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center max-sm:text-left">Prénom</TableHead>
              <TableHead className="text-center">Nom</TableHead>
              <TableHead className="text-center max-sm:hidden">Contact</TableHead>
              {roles.canManageActivity === true && (
                <>
                  <TableHead className="text-center">
                    Activité (
                    {lastMonth.toLocaleDateString('fr', {
                      month: 'short',
                      year: 'numeric',
                    })}
                    )
                  </TableHead>
                  <TableHead className="text-center max-sm:hidden">
                    Activité (
                    {today.toLocaleDateString('fr', {
                      month: 'short',
                      year: 'numeric',
                    })}
                    )
                  </TableHead>
                </>
              )}
              {roles.canManagePublisher && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.members.map(member => (
              <TableRow key={member.email}>
                <TableCell className="text-center max-sm:text-left">
                  <Link className="hover:text-primary" to={`../../../publishers/${member.id}/view`} relative="path">
                    {member.firstname}
                  </Link>
                </TableCell>
                <TableCell className="text-center">
                  <Link className="hover:text-primary" to={`../../../publishers/${member.id}/view`} relative="path">
                    {member.lastname?.toLocaleUpperCase()}
                  </Link>
                </TableCell>
                <TableCell className="text-center max-sm:hidden">
                  {member.email.includes('@placeholder.unitae.app') === false && (
                    <Link to={`mailto:${member.email}`} className="hover:text-primary">
                      <Mail className="inline size-4" />
                    </Link>
                  )}
                </TableCell>
                {roles.canManageActivity === true && (
                  <>
                    <TableCell className="text-center">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={
                            member.previousActivity != null
                              ? `/congregation/publishers/activity/${member.previousActivity?.id}/edit`
                              : `/congregation/publishers/activity/new?publisherId=${member.id}&month=${lastMonth.getMonth()}&year=${lastMonth.getFullYear()}`
                          }
                          title="Modifier l'activité du proclamateur pour le mois courant"
                        >
                          {member.previousActivity ? (
                            <>
                              <BarChart3 className="size-4" /> Voir
                            </>
                          ) : (
                            <>
                              <Plus className="size-4" /> Ajouter
                            </>
                          )}
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell className="text-center max-sm:hidden">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={
                            member.currentActivity != null
                              ? `/congregation/publishers/activity/${member.currentActivity?.id}/edit`
                              : `/congregation/publishers/activity/new?publisherId=${member.id}&month=${today.getMonth()}&year=${today.getFullYear()}`
                          }
                          title="Modifier l'activité du proclamateur pour le mois courant"
                        >
                          {member.currentActivity ? (
                            <>
                              <BarChart3 className="size-4" /> Voir
                            </>
                          ) : (
                            <>
                              <Plus className="size-4" /> Ajouter
                            </>
                          )}
                        </Link>
                      </Button>
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`../../../publishers/${member.id}/view`} relative="path">
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    {roles.canManagePublisher && (
                      <Button asChild variant="ghost" size="icon">
                        <Link to={`../../../publishers/${member.id}/edit`} relative="path">
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  await verifySession(request)
  const previousPage = request.headers.get('referer')
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect(previousPage ?? '/')
  }

  const form = await request.formData()
  const name = form.get('name')
  const address = form.get('address')
  const responsibleId = Number(form.get('responsible'))
  const deputyRaw = form.get('deputy')
  const deputyId = deputyRaw ? Number(deputyRaw) : null

  const session = await getSession(request.headers.get('Cookie'))
  if (name == null || address == null || Number.isNaN(responsibleId)) {
    session.flash('error', 'Veuillez remplir entièrement le formulaire avant soumission')
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  if (deputyId != null && responsibleId === deputyId) {
    session.flash('error', 'Le responsable de groupe et son adjoint ne peuvent pas être la même personne')
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const membersToConnect = [{ id: responsibleId }]
  if (deputyId != null) membersToConnect.push({ id: deputyId })

  const group = await db.publisherGroup.update({
    where: {
      id: requireParamId(params.groupId, '/congregation/publisher-groups'),
    },
    data: {
      name: String(name),
      adress: String(address),
      deputyId,
      responsibleId,
      members: { connect: membersToConnect },
    },
  })

  session.flash('success', `Le groupe de prédication ${group.name} à été modifié avec succès`)
  return redirect('/congregation/publisher-groups', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
