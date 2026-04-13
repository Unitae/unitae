import * as m from '~/paraglide/messages'
import type { UserInput } from '~/shared/types/user-input'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'

export default function PublisherNominationForm({ user }: { user?: UserInput }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.publishers_form_nomination()}</CardTitle>
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
            {m.publishers_form_is_servant_before()}{' '}
            <span className="font-bold text-primary">{m.publishers_form_is_servant_highlight()}</span>{' '}
            {m.publishers_form_is_servant_after()}
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
            {m.publishers_form_is_elder_before()}{' '}
            <span className="font-bold text-primary">{m.publishers_form_is_elder_highlight()}</span>{' '}
            {m.publishers_form_is_elder_after()}
          </Label>
        </div>
      </CardContent>
    </Card>
  )
}
