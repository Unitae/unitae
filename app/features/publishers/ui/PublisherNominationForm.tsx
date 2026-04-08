import type { UserInput } from '~/shared/types/user-input'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'

export default function PublisherNominationForm({ user }: { user?: UserInput }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nomination</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <input
            className="size-4 rounded border border-input"
            name="isServant"
            type="checkbox"
            id="isServant"
            defaultChecked={user?.isServant}
          />
          <Label htmlFor="isServant" className="font-normal">
            Le proclamateur est <span className="font-bold text-primary">assistant</span> dans l'assemblée.
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="size-4 rounded border border-input"
            name="isHelder"
            type="checkbox"
            id="isHelder"
            defaultChecked={user?.isHelder}
          />
          <Label htmlFor="isHelder" className="font-normal">
            Le proclamateur est <span className="font-bold text-primary">ancien</span> dans l'assemblée.
          </Label>
        </div>
      </CardContent>
    </Card>
  )
}
