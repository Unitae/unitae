import type { UserInput } from '~/shared/types/user-input'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

export default function PublisherPersonalInformationForm({ user }: { user?: UserInput }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Informations personnelles</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstname">Prénom</Label>
            <Input
              id="firstname"
              name="firstname"
              type="text"
              placeholder="Prénom"
              required
              defaultValue={user?.firstname ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastname">Nom</Label>
            <Input
              id="lastname"
              name="lastname"
              type="text"
              placeholder="Nom"
              defaultValue={user?.lastname ?? ''}
              required
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="birthDate">Date de naissance</Label>
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              defaultValue={user?.birthDate?.toLocaleDateString('en-CA') ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="baptismDate">Date de baptême</Label>
            <Input
              id="baptismDate"
              name="baptismDate"
              type="date"
              defaultValue={user?.baptismDate?.toLocaleDateString('en-CA') ?? ''}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Genre</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  className="size-4 border border-input"
                  name="gender"
                  type="radio"
                  value="male"
                  required
                  defaultChecked={user?.isMale === true}
                />
                Homme
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  className="size-4 border border-input"
                  name="gender"
                  type="radio"
                  value="female"
                  required
                  defaultChecked={user?.isMale === false}
                />
                Femme
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3 self-end">
            <input
              className="size-4 rounded border border-input"
              name="isAnointed"
              type="checkbox"
              id="isAnointed"
              defaultChecked={user?.isAnointed}
            />
            <Label htmlFor="isAnointed" className="font-normal">
              Le proclamateur est <span className="font-bold text-primary">oint</span>.
            </Label>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="Email" defaultValue={user?.email ?? ''} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" name="phone" type="text" placeholder="Téléphone" defaultValue={user?.phone ?? ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" name="address" type="text" placeholder="Domicile" defaultValue={user?.address ?? ''} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
