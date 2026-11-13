import { SidePanel, Tag } from '@unitae/ui'
import { ChevronRight, Pencil } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import type { OffChartRole, PanelRole } from '~/features/congregation/model/organigram-page.type'
import { AttachRolePicker } from '~/features/congregation/ui/AttachRolePicker'
import { DeleteRoleDialog } from '~/features/congregation/ui/DeleteRoleDialog'
import { ROLE_FORM_ID, RoleForm } from '~/features/congregation/ui/RoleForm'
import { RolePlace } from '~/features/congregation/ui/RolePlace'
import { RoleSeats } from '~/features/congregation/ui/RoleSeats'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import type { PersonOption } from '~/shared/ui/PersonDropdown'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

// The selected role, beside the chart from 1280 px and in a sheet below: who sits in it, what is under it, where it
// stands. A role the congregation made is edited here too (« Modifier »). A reader sees the same panel, without a
// single control.

const KIND_TAG = {
  roster: m.org_kind_roster,
  committee: m.org_kind_committee,
  post: m.org_kind_post,
  team: m.org_kind_team,
  personal: m.org_kind_personal,
} as const

/** What arranging the chart needs; absent for a reader. */
export interface RolePanelManage {
  people: PersonOption[]
  nonElderIds: number[]
  offChart: OffChartRole[]
}

// Sections sit in the panel's own padding, divided by a rule.
const sectionClass = 'flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0'

function RoleView({
  role,
  manage,
  onOpenRole,
  onCreateUnder,
}: {
  role: PanelRole
  manage: RolePanelManage | null
  onOpenRole: (roleId: number) => void
  onCreateUnder: (name: string) => void
}) {
  // Roles hang under roles of the chart: one outside it takes none.
  const canArrange = manage != null && !role.offChart && role.kind !== 'committee' && role.kind !== 'roster'
  return (
    <div className="divide-border flex flex-col divide-y">
      {(role.description || role.note) && (
        <section className={sectionClass}>
          {role.description && <p className="text-sm leading-relaxed">{role.description}</p>}
          {role.note && <p className="text-faint text-xs">{m.org_note_on_board({ note: role.note })}</p>}
        </section>
      )}
      <RoleSeats role={role} people={manage?.people} nonElderIds={manage?.nonElderIds} editable={manage != null} />
      {role.kind === 'team' && (
        <section className={sectionClass}>
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            {m.org_members_title()}
            <span className="text-faint font-normal tabular-nums">{role.members.length}</span>
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {role.members.length > 0 ? role.members.join(' · ') : m.org_members_none()}
          </p>
          {manage != null && (
            <Link to="/congregation/roles" className="text-primary self-start text-sm hover:underline">
              {m.org_members_manage()}
            </Link>
          )}
        </section>
      )}
      {(role.children.length > 0 || canArrange) && (
        <section className={sectionClass}>
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            {m.org_children_title()}
            {role.children.length > 0 && (
              <span className="text-faint font-normal tabular-nums">{role.children.length}</span>
            )}
          </h3>
          {role.children.length > 0 && (
            <ul className="flex flex-col">
              {role.children.map(child => (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRole(child.id)}
                    className="hover:bg-hover focus-visible:ring-ring -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-none focus-visible:ring-2"
                  >
                    <ChevronRight aria-hidden="true" className="text-faint size-3.5" />
                    {child.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canArrange && (
            <AttachRolePicker
              parent={role}
              offChart={manage.offChart}
              onCreate={onCreateUnder}
              onAttached={onOpenRole}
            />
          )}
        </section>
      )}
      {manage != null && <RolePlace role={role} />}
    </div>
  )
}

/** Where the role stands, and what it is: the line under its name. */
function PanelDescription({ role }: { role: PanelRole }) {
  const context = role.offChart
    ? m.org_new_off_chart()
    : role.parent
      ? m.org_under({ name: role.parent.name })
      : m.org_top()
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{context}</span>
      <Tag>{KIND_TAG[role.kind]()}</Tag>
    </span>
  )
}

/** Docked beside the chart from 1280 px; a sheet over the page below. */
function PanelFrame({
  role,
  docked,
  returnFocus,
  onClose,
  actions,
  footer,
  children,
}: {
  role: PanelRole
  docked: boolean
  returnFocus: HTMLElement | null
  onClose: () => void
  /** « Modifier », in the header before the close button. */
  actions: ReactNode
  /** The edit form's cancel and save. */
  footer: ReactNode
  children: ReactNode
}) {
  const sheet = useRef<HTMLDivElement>(null)
  if (docked) {
    return (
      <SidePanel
        title={role.name}
        description={<PanelDescription role={role} />}
        closeLabel={m.org_close()}
        onClose={onClose}
        returnFocus={returnFocus}
        actions={actions}
        footer={footer}
      >
        {children}
      </SidePanel>
    )
  }
  return (
    <Sheet open onOpenChange={next => !next && onClose()}>
      <SheetContent
        ref={sheet}
        className="gap-0 outline-none sm:max-w-md"
        aria-label={m.org_panel_label({ name: role.name })}
        // The sheet itself takes focus, not « Modifier »: nothing lights up as it opens, and Tab starts at the top.
        onOpenAutoFocus={event => {
          event.preventDefault()
          sheet.current?.focus()
        }}
      >
        {/* The right padding keeps the actions and the title clear of the sheet's close button. */}
        <SheetHeader className="border-border border-b pr-12 pointer-coarse:pr-16">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SheetTitle>{role.name}</SheetTitle>
              <SheetDescription asChild>
                <div>
                  <PanelDescription role={role} />
                </div>
              </SheetDescription>
            </div>
            {actions != null && <div className="flex flex-none items-center gap-1">{actions}</div>}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <SheetFooter className="border-border flex-row justify-end border-t">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}

function EditFooter({ changes, busy, onCancel }: { changes: number; busy: boolean; onCancel: () => void }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="text-muted-foreground flex-1 text-sm" aria-live="polite">
        {changes === 0 ? null : m.form_changes({ count: changes })}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {m.common_cancel()}
      </Button>
      <Button type="submit" size="sm" form={ROLE_FORM_ID} disabled={busy}>
        {m.common_save()}
      </Button>
    </div>
  )
}

export function RolePanel({
  role,
  manage,
  docked,
  returnFocus,
  onClose,
  onOpenRole,
  onCreateUnder,
  onDirtyChange,
  onDeleted,
}: {
  role: PanelRole
  manage: RolePanelManage | null
  docked: boolean
  returnFocus: HTMLElement | null
  onClose: () => void
  onOpenRole: (roleId: number) => void
  /** « Créer « x » » under this role: the new-role dialog takes over. */
  onCreateUnder: (name: string) => void
  /** The edit form holds unsaved changes: opening another role should ask first. */
  onDirtyChange: (dirty: boolean) => void
  /** The role is gone: the panel closes without asking about its form. */
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fetcher = useFetcher()
  const form = useFormChanges()
  useCloseOnSave(fetcher, () => setEditing(false))
  const dirty = editing && form.changes > 0

  // Gone with the panel, however it closes — a revalidation after a deletion included — so no later click asks about
  // a form that no longer exists.
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  const canEdit = manage != null && role.editable
  const actions =
    canEdit && !editing ? (
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
        <Pencil aria-hidden="true" />
        {m.org_edit()}
      </Button>
    ) : undefined
  const footer = editing ? (
    <EditFooter changes={form.changes} busy={fetcher.state !== 'idle'} onCancel={() => setEditing(false)} />
  ) : undefined

  return (
    <>
      <PanelFrame
        role={role}
        docked={docked}
        returnFocus={returnFocus}
        onClose={onClose}
        actions={actions}
        footer={footer}
      >
        {editing ? (
          <RoleForm role={role} fetcher={fetcher} formRef={form.ref} onDelete={() => setDeleting(true)} />
        ) : (
          <RoleView role={role} manage={manage} onOpenRole={onOpenRole} onCreateUnder={onCreateUnder} />
        )}
      </PanelFrame>
      {deleting && (
        <DeleteRoleDialog
          role={role}
          peopleCount={role.seats.length + role.members.length}
          open
          onOpenChange={setDeleting}
          onDeleted={() => {
            setDeleting(false)
            onDeleted()
          }}
        />
      )}
    </>
  )
}
