import * as m from '~/i18n/paraglide/messages'
import type { UserInput } from '~/shared/types/user-input'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

export default function PublisherPersonalInformationForm({
  user,
  onGenderChange,
}: {
  user?: UserInput
  onGenderChange?: (gender: 'male' | 'female') => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.publishers_form_personal_info()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstname">{m.publishers_form_firstname()}</Label>
            <Input
              id="firstname"
              name="firstname"
              type="text"
              placeholder={m.publishers_form_firstname()}
              required
              defaultValue={user?.firstname ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastname">{m.publishers_form_lastname()}</Label>
            <Input
              id="lastname"
              name="lastname"
              type="text"
              placeholder={m.publishers_form_lastname()}
              defaultValue={user?.lastname ?? ''}
              required
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="birthDate">{m.publishers_form_birth_date()}</Label>
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              defaultValue={user?.birthDate?.toLocaleDateString('en-CA') ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="baptismDate">{m.publishers_form_baptism_date()}</Label>
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
            <Label>{m.publishers_form_gender()}</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  className="size-4 border border-input"
                  name="gender"
                  type="radio"
                  value="male"
                  required
                  defaultChecked={user?.isMale === true}
                  onChange={() => onGenderChange?.('male')}
                />
                {m.publishers_form_gender_male()}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  className="size-4 border border-input"
                  name="gender"
                  type="radio"
                  value="female"
                  required
                  defaultChecked={user?.isMale === false}
                  onChange={() => onGenderChange?.('female')}
                />
                {m.publishers_form_gender_female()}
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
              {m.publishers_form_anointed_before()}{' '}
              <span className="font-bold text-primary">{m.publishers_form_anointed_highlight()}</span>
              {m.publishers_form_anointed_after()}
            </Label>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{m.publishers_form_email()}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={m.publishers_form_email()}
            defaultValue={user?.email ?? ''}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">{m.publishers_form_phone()}</Label>
            <Input
              id="phone"
              name="phone"
              type="text"
              placeholder={m.publishers_form_phone_placeholder()}
              defaultValue={user?.phone ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">{m.publishers_form_address()}</Label>
            <Input
              id="address"
              name="address"
              type="text"
              placeholder={m.publishers_form_address_placeholder()}
              defaultValue={user?.address ?? ''}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
