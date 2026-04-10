import { Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db, restoreCongregationContext } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Modification d'une section du Tableau d'affichage - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canUploadDocument) {
    throw redirect('/')
  }

  restoreCongregationContext(currentUser.congregationId)
  const document = await db.boardDocument.findUnique({
    where: {
      id: requireParamId(params.documentId, '/board'),
    },
  })

  const sections = await db.boardSection.findMany()

  if (document == null) throw redirect('/board/documents')

  return { document, sections, rights: { canManageBoard, canUploadDocument } }
}

export default function EditDocumentPage({ loaderData }: Route.ComponentProps) {
  const { document, sections, rights } = loaderData

  let formattedVisibleFrom = ''
  if (document.visibleFrom !== null) {
    const visibleFrom = new Date(document.visibleFrom)
    visibleFrom.setMinutes(visibleFrom.getMinutes() - visibleFrom.getTimezoneOffset())
    formattedVisibleFrom = visibleFrom.toISOString().slice(0, 16)
  }

  let formattedVisibleUntil = ''
  if (document.visibleUntil !== null) {
    const visibleUntil = new Date(document.visibleUntil)
    visibleUntil.setMinutes(visibleUntil.getMinutes() - visibleUntil.getTimezoneOffset())
    formattedVisibleUntil = visibleUntil.toISOString().slice(0, 16)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modification d'un document"
        subtitle="Modifier un document du tableau d'affichage"
        actions={
          <Button variant="destructive" size="icon" asChild>
            <Link to={`/board/documents/${document.id}/delete`} title="Supprimer complètement le document">
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Nom</Label>
              <Input
                id="title"
                name="title"
                type="text"
                placeholder="Nom du document"
                autoComplete="off"
                defaultValue={document.title ?? ''}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="sectionId">Section</Label>
              <select
                id="sectionId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                name="sectionId"
                defaultValue={document.sectionId}
              >
                {sections.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>

            {rights.canManageBoard && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="visible-from">Visible à partir du</Label>
                  <Input
                    id="visible-from"
                    name="visible-from"
                    type="datetime-local"
                    placeholder="Début de la période de visibilité"
                    defaultValue={formattedVisibleFrom}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="visible-until">Visible jusqu'au</Label>
                  <Input
                    id="visible-until"
                    name="visible-until"
                    type="datetime-local"
                    placeholder="Fin de la période de visibilité"
                    defaultValue={formattedVisibleUntil}
                  />
                </div>
              </div>
            )}

            {rights.canManageBoard && (
              <div className="flex items-center gap-2">
                <input
                  id="hightlighted"
                  className="size-4 rounded border border-input accent-primary"
                  name="hightlighted"
                  type="checkbox"
                  defaultChecked={document.isHighlighted}
                />
                <Label
                  htmlFor="hightlighted"
                  className="cursor-pointer font-normal"
                  title="Le document s'affichera également tout en haut du tableau d'affichage pour être visible par tous"
                >
                  Mettre en avant le document sur le tableau d'affichage
                </Label>
              </div>
            )}

            <Button type="submit" className="w-fit">
              Modifier le document
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  restoreCongregationContext(currentUser.congregationId)
  const form = await request.formData()
  const title = String(form.get('title'))
  const sectionId = Number(form.get('sectionId'))
  const visibleFrom = new Date(String(form.get('visible-from')))
  const visibleUntil = new Date(String(form.get('visible-until')))
  const isHighlighted = form.get('hightlighted') === 'on'

  if (title.length < 1) {
    session.flash('error', 'Vous devez remplir tous les champs du formulaire. Réessayez.')
    throw redirect(`/board/document/${params.documentId}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const document = await db.boardDocument.update({
    where: {
      id: requireParamId(params.documentId, '/board'),
    },
    data: {
      title: String(title),
      section: {
        connect: {
          id: sectionId,
        },
      },
      visibleFrom: visibleFrom.getTime() > 0 ? visibleFrom : canManageBoard ? null : undefined,
      visibleUntil: visibleUntil.getTime() > 0 ? visibleUntil : canManageBoard ? null : undefined,
      isHighlighted,
    },
  })

  if (document == null) {
    session.flash('error', `Quelque chose s'est mal passé. Réessayez.`)

    return redirect(`/board/document/${params.documentId}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  session.flash('success', `Section "${document.title}" modifiée avec succès.`)

  return redirect(`/board/documents/${document.id}/edit`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
