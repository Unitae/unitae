import { Form } from 'react-router'
import type { Building } from '~/database/generated/client'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'

export default function BuildingTerritoryInfo({ building }: { building: Building }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes internes</CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>
              Notes pour le service Territoires{' '}
              <span className="text-muted-foreground text-sm">(Ne sera pas visible sur le territoire)</span>
            </Label>
            <textarea className="rounded-md border border-input bg-background px-3 py-2 text-sm" rows={4} name="notes">
              {building.notes}
            </textarea>
          </div>
          <p className="text-muted-foreground text-sm italic">
            Les informations visibles par les proclamateurs sont maintenant saisies par entrée dans le formulaire de
            prospection.
          </p>
          <Button type="submit" className="self-start">
            Enregistrer les notes
          </Button>
        </Form>
      </CardContent>
    </Card>
  )
}
