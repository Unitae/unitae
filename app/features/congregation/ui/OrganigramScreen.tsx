import { Eye, Network, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { OrganigramPage } from '~/features/congregation/model/organigram-page.type'
import { AdoptCommitteeDialog } from '~/features/congregation/ui/AdoptCommitteeDialog'
import { NewRoleDialog } from '~/features/congregation/ui/NewRoleDialog'
import { OrganigramHelp } from '~/features/congregation/ui/OrganigramHelp'
import { OrganigramRootAdd } from '~/features/congregation/ui/OrganigramRootAdd'
import { OrganigramTree } from '~/features/congregation/ui/OrganigramTree'
import { OrgHeading } from '~/features/congregation/ui/OrgHeading'
import { RolePanel } from '~/features/congregation/ui/RolePanel'
import { RolesTabs } from '~/features/congregation/ui/RolesTabs'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { useOpenParam } from '~/shared/ui/hooks/use-open-param'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

// The organigram page: the chart reads without a click, a selected role opens its panel beside it (from 1280 px) or
// in a sheet, and every change goes through a fetcher — the chart and the panel stay where they are. The selected
// role lives in the address (?role=…), so a reload or a shared link comes back to it.

/** From this width the panel docks beside the chart; below, it opens in a sheet. */
const DOCKED = '(min-width: 1280px)'

interface NewRole {
  name: string
  parentId: number | null
}

export function OrganigramScreen({ page }: { page: OrganigramPage & { canManage: boolean } }) {
  const { tree, panel, boardDocumentId, manage, canManage } = page
  const [params, setParams] = useSearchParams()
  const docked = useMediaQuery(DOCKED) === true
  const trigger = useRef<HTMLElement | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<{ next: number | null } | null>(null)
  const [newRole, setNewRole] = useState<NewRole | null>(null)
  const [adopting, setAdopting] = useState(false)

  const go = useCallback(
    (roleId: number | null) => {
      setParams(
        previous => {
          previous.delete('node')
          if (roleId == null) previous.delete('role')
          else previous.set('role', String(roleId))
          return previous
        },
        { preventScrollReset: true },
      )
    },
    [setParams],
  )
  // The address names a role the page no longer shows — deleted, or taken out of the chart — so it stops naming it.
  // Both come from the same loaded state, so a role being opened is never mistaken for a missing one.
  const named = params.get('role') ?? params.get('node')
  useEffect(() => {
    if (named == null || panel != null) return
    setParams(
      previous => {
        previous.delete('role')
        previous.delete('node')
        return previous
      },
      { replace: true, preventScrollReset: true },
    )
  }, [named, panel, setParams])

  /** Opens another role, or closes with `null`; asks first while the open role's form holds changes. */
  const select = (roleId: number | null) => {
    if (dirty && roleId !== panel?.id) setPending({ next: roleId })
    else go(roleId)
  }

  const openNewRole = () => setNewRole({ name: '', parentId: panel?.id ?? null })
  useOpenParam('new', () => canManage && openNewRole())
  useOpenParam('adopt', () => manage?.committee != null && setAdopting(true))

  const rolePanel = panel && (
    <RolePanel
      key={panel.id}
      role={panel}
      manage={manage}
      docked={docked}
      returnFocus={trigger.current}
      onClose={() => select(null)}
      onOpenRole={go}
      onCreateUnder={name => setNewRole({ name, parentId: panel.id })}
      onDirtyChange={setDirty}
      onDeleted={() => go(null)}
    />
  )

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked panel can stick.
    <div data-sticky-content="" className="flex flex-col gap-5">
      <PageTopbar
        trail={[{ label: m.org_title() }]}
        className="mb-0"
        actions={
          <>
            {boardDocumentId != null && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/board/dynamic/${boardDocumentId}/viewer`}>
                  <Eye aria-hidden="true" />
                  {m.org_view_board()}
                </Link>
              </Button>
            )}
            {canManage && (
              <Button size="sm" className="max-md:hidden" onClick={openNewRole}>
                <Plus aria-hidden="true" />
                {m.org_new_role()}
              </Button>
            )}
          </>
        }
      >
        <OrgHeading canCreate={canManage} newRole={{ onClick: openNewRole }} />
      </PageTopbar>

      <RolesTabs />

      {manage?.committee && (
        // Shown until the committee is taken over. Never automatic: it moves people and permissions.
        <div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
          <Network aria-hidden="true" className="text-faint size-4 shrink-0 max-sm:hidden" />
          <p className="flex-1 text-sm">{m.org_banner_committee()}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start sm:self-auto"
            onClick={() => setAdopting(true)}
          >
            {m.org_banner_committee_action()}
          </Button>
        </div>
      )}

      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {tree.length === 0 ? (
            <EmptyState
              icon={Network}
              title={m.org_empty_title()}
              description={m.org_empty_body()}
              action={manage ? <OrganigramRootAdd rosters={manage.rosters} emphasis="primary" /> : undefined}
            />
          ) : (
            <section aria-label={m.org_tree_label()} className="border-border bg-card rounded-lg border p-2 sm:p-3">
              <OrganigramTree
                tree={tree}
                selectedId={panel?.id ?? null}
                onSelect={(id, element) => {
                  trigger.current = element
                  select(id === panel?.id ? null : id)
                }}
              />
            </section>
          )}
          {manage && tree.length > 0 && <OrganigramRootAdd rosters={manage.rosters} />}
          {canManage && <OrganigramHelp defaultOpen={tree.length === 0} />}
        </div>
        {docked && rolePanel}
      </div>
      {!docked && rolePanel}

      {manage && newRole && (
        <NewRoleDialog
          open
          onOpenChange={open => !open && setNewRole(null)}
          places={manage.places}
          defaultName={newRole.name}
          defaultParentId={newRole.parentId}
          onCreated={roleId => {
            setNewRole(null)
            go(roleId)
          }}
        />
      )}
      {manage?.committee && adopting && (
        <AdoptCommitteeDialog
          open
          onOpenChange={setAdopting}
          posts={manage.committee.posts}
          candidates={manage.committee.candidates}
        />
      )}
      <DiscardChangesDialog
        open={pending != null}
        onStay={() => setPending(null)}
        onDiscard={() => {
          go(pending?.next ?? null)
          setPending(null)
          setDirty(false)
        }}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    </div>
  )
}
