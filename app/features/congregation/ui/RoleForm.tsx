import type { Ref } from 'react'
import type { FetcherWithComponents } from 'react-router'
import type { PanelRole } from '~/features/congregation/model/organigram-page.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { Textarea } from '~/shared/ui/textarea'

// A role's own definition, edited in its panel: name, description, the note printed on the board, and its type.
// People are not here — they are named in the panel's view. Saved in one go by the panel's footer.

export const ROLE_FORM_ID = 'role-form'

function Optional() {
  return <span className="text-faint font-normal"> · {m.org_form_optional()}</span>
}

/** The two shapes a role takes, as radio choices with what each means. */
export function RoleTypeChoice({ defaultSingle, id }: { defaultSingle: boolean; id: string }) {
  const choices = [
    { value: 'off', title: m.org_type_team(), hint: m.org_type_team_hint() },
    { value: 'on', title: m.org_type_personal(), hint: m.org_type_personal_hint() },
  ]
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{m.org_form_type()}</legend>
      <RadioGroup name="singlePerson" defaultValue={defaultSingle ? 'on' : 'off'} className="gap-1.5">
        {choices.map(choice => (
          <Label
            key={choice.value}
            htmlFor={`${id}-${choice.value}`}
            className="border-border has-data-[state=checked]:border-primary has-data-[state=checked]:bg-selected flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 font-normal"
          >
            <RadioGroupItem id={`${id}-${choice.value}`} value={choice.value} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{choice.title}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">{choice.hint}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}

export function RoleForm({
  role,
  fetcher,
  formRef,
  onDelete,
}: {
  role: PanelRole
  fetcher: FetcherWithComponents<unknown>
  formRef: Ref<HTMLFormElement>
  onDelete: () => void
}) {
  const error = (fetcher.data as { ok?: boolean; error?: string } | undefined)?.ok === false
  const message = error ? (fetcher.data as { error: string }).error : null
  const blocked = role.children.length > 0

  return (
    <div className="divide-border flex flex-col divide-y">
      <fetcher.Form id={ROLE_FORM_ID} method="post" ref={formRef} className="flex flex-col gap-4 pb-4">
        <input type="hidden" name="intent" value="update" />
        <input type="hidden" name="roleId" value={role.id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-name">{m.org_form_name()}</Label>
          <Input id="role-name" name="name" defaultValue={role.name} required maxLength={100} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-description">
            {m.org_form_description()}
            <Optional />
          </Label>
          <Textarea
            id="role-description"
            name="description"
            defaultValue={role.description ?? ''}
            maxLength={1000}
            rows={3}
            aria-describedby="role-description-hint"
          />
          <p id="role-description-hint" className="text-faint text-xs">
            {m.org_form_description_hint()}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-note">
            {m.org_form_note()}
            <Optional />
          </Label>
          <Input
            id="role-note"
            name="note"
            defaultValue={role.note ?? ''}
            maxLength={200}
            placeholder={m.org_form_note_placeholder()}
            aria-describedby="role-note-hint"
            autoComplete="off"
          />
          <p id="role-note-hint" className="text-faint text-xs">
            {m.org_form_note_hint()}
          </p>
        </div>
        <RoleTypeChoice id="role-type" defaultSingle={role.kind === 'personal'} />
        {message && (
          <p role="alert" className="text-destructive text-sm">
            {message}
          </p>
        )}
      </fetcher.Form>
      <section className="flex flex-col gap-1.5 pt-3.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive self-start"
          aria-disabled={blocked}
          aria-describedby={blocked ? 'role-delete-blocked' : undefined}
          onClick={() => !blocked && onDelete()}
        >
          {m.org_delete()}
        </Button>
        {blocked && (
          <p id="role-delete-blocked" className="text-faint text-xs">
            {m.org_delete_blocked({ names: role.children.map(child => child.name).join(', ') })}
          </p>
        )}
      </section>
    </div>
  )
}
