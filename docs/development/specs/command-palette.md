# Spec: Command Palette (Cmd+K) — navigation, search & actions

**Status:** Draft — design agreed + revised after expert review; not yet implemented
**Author:** Nathanaël Cherrier
**Feature area:** `shared/ui` (command palette) + new `features/command-palette` (search endpoint) + per-feature search query fns
**Related:** [Permissions & Roles](../permissions-and-roles.md), [Architecture Conventions](../architecture-conventions.md), [Row-Level Security](../row-level-security.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state behavior
> should be folded into the relevant `docs/` pages and this file archived.

> **Revision note.** This spec was reviewed through three lenses (UX, UI, engineering). Their findings
> corrected several factual reuse errors (the territory/building `applySearchFilter` is private; the
> publishers `getPublishersWithGroup` is unexported and matches non-normalized columns; `Event` has
> no `title` field — it is `name` — and its `computeFilters` always forces a date range; the debounce
> hook lives at `shared/ui/hooks/use-debounced-value.ts`), resolved the "current member id" question
> (`currentAccountContext.member?.id`, nullable), and hardened the interaction/state design (identity-
> based selection under async streaming, a full state matrix incl. an error state, query-dependent
> ordering, ARIA combobox semantics, hover-vs-keyboard decoupling, the 400-line file budget). The
> sections below reflect those corrections. Three product forks were decided by the author: **keep the
> hand-rolled palette + add full ARIA** (no `cmdk` dependency); **contextual actions = in-row icon
> buttons**; **recent items ship in v1**.

## 1. Problem

The Cmd+K palette (`app/shared/ui/CommandPalette.tsx`) today is a hand-rolled dialog that only does
**top-level page navigation**. `getNavigationItems(permissions)` builds a static, permission-gated
list of ~20 module pages; the input filters it with `label.includes()`. It cannot answer the
question a user actually has when they hit ⌘K:

> "Take me to *territory 12* / *this publisher* / *that building* / *this event* — or just let me
> *create* one — without clicking through the nav."

It has **no search** (can't find a specific entity), **no depth** (can't reach a settings
sub-section), and **no actions** (can't create or log out). For a congregation with hundreds of
territories/publishers, navigating the nav tree by hand is the only option.

## 2. Goals / Non-goals

**Goals**

- Turn ⌘K into a real command palette with three capabilities, **all strictly role-gated**:
  **navigation** (top-level *and* deep links), **search** (live, server-side, across territories, my
  attributions, publishers, buildings, events, documents), and **actions** (quick-create, session/UI,
  contextual on a found entity).
- **Role gating is the hard invariant:** a user without a module's permission must never see its
  pages, its search results, or its actions — anywhere in the palette.
- Be fast (debounced, cancellable), legible (grouped, keyboard-first), and **accessible** (proper
  combobox/listbox ARIA — the current palette has none).
- Usable on a phone (the sidebar exposes the same palette via a search button).

**Non-goals**

- **Inline entity mutations** from the palette (e.g. "mark returned" / "assign" without leaving the
  palette). v1 contextual actions **navigate** to the entity's action page; true in-palette mutations
  need confirmation/undo UX + CSRF-safe forms and are deferred. *(Decision: out of scope for v1.)*
- Migrating to the `cmdk` library. *(Decision: keep hand-rolled + add ARIA.)*
- Fuzzy-ranking library, `pg_trgm` GIN substring indexing, match-substring highlighting.
- Unifying the sidebar's gating with the palette's into a single source (they stay separate; this
  spec only unifies the *palette's* own entries).
- Changing any schema, or any read/write behavior of the searched entities.

## 3. Users & job-to-be-done

Every authenticated user. Job: **get to a specific place or thing, or start a specific task, in two
keystrokes** — scoped to exactly what their role permits. A territory servant searches territories &
buildings; a secretary searches publishers & events; a board-only user sees only board pages,
documents, and the board quick-actions. The palette must feel like a personalized index of "things I
can do here", never a listing of features I can't access.

## 4. Current implementation background (verified)

- **Palette:** custom, built on `Dialog` + `Input` (no `cmdk`). `getNavigationItems(permissions)`
  returns a static `CommandItem[]`; filter is `label.includes()`; keyboard nav uses a **positional**
  `selectedIndex` that resets to 0 whenever `filtered.length` changes; rows are `<button>`s with
  `data-selected`; `onMouseEnter` sets the selection (hover === selection).
- **Data flow:** the palette receives the `AppSidebarPermissions` **boolean bag** as a prop from
  `AppLayout`, derived in `app/shell/_authenticated-layout.tsx` from `permissionsContext`
  (`Set<Permission>`; `Admin` expands to all). The palette does **zero** data loading today.
- **File budget:** `CommandPalette.tsx` is **already 267 lines** (component budget soft 200 / hard
  400) — added JSX **must** be split into subcomponents or `test:file-sizes` fails on push.
- **A11y:** none — bare textbox + a `div` of buttons; no `role`, no `aria-activedescendant`, no live
  region.

### Reuse targets — corrected by review

- **Territories / buildings:** `applySearchFilter` is **private**; only
  `computeFilters(params: URLSearchParams)` is exported from `territory-filters.server.ts` /
  `building-filters.server.ts`. A *same-feature* search fn can call
  `computeFilters(new URLSearchParams({ search: q }))` — with only `search` set it returns exactly the
  diacritics-aware search `OR` (number / normalized street / attributee name). Reuse **this**.
- **Publishers:** `getPublishersWithGroup` is **not exported** and matches non-normalized
  `firstname`/`lastname`. Write a dedicated `searchPublishers` on the indexed
  `firstnameNormalized`/`lastnameNormalized` columns with `stripDiacritics(q)` (consistent with
  territory search).
- **Events:** the field is **`name`** (no `title`); `event-filters.server.ts` `computeFilters`
  **always** injects a date range, so it is unusable for a name search. Write a fresh `searchEvents`
  → `{ OR: [{ name: { contains, mode:'insensitive' } }, { description: {…} }] }`.
- **Documents:** the model is **`BoardDocument`** (has `title`). Write `searchDocuments` on `title`;
  honor `visibleFrom`/`visibleUntil` for non-managers.
- **My attributions:** the current member id is `context.get(currentAccountContext).member?.id` —
  present but **nullable**; when null, **omit the "Mes attributions" group** (no fallback lookup).
- **Debounce hook:** `app/shared/ui/hooks/use-debounced-value.ts` → `useDebouncedValue(value, 200)`.
- **Substring reality:** `{ contains }` = `%q%` cannot use the btree normalized indexes → sequential
  scans. Fine at congregation scale; do not claim indexes accelerate it.

## 5. Design overview

Keep the hand-rolled palette. Split responsibilities into a **static command registry** (client-safe,
pure, gated by the boolean bag), a **server search endpoint** (gated by the `Set<Permission>`,
skip-silently), a **recents store** (localStorage), and an **accessible, grouped palette** that merges
static commands with live search.

```
buildStaticCommands(permissionsBag)            recents.ts (localStorage MRU)
        │  (nav deep-links + actions, gated)          │
        └──────────────┬──────────────────────────────┘
                       ▼
                CommandPalette  ──(useFetcher, debounced 200ms, cancellable)──►
                       ▲                                     GET /api/command-search?q=
                       │                                            │  withScopeFromContext (RLS)
   command-list.ts (pure: filter/rank/flatten,                     │  per-type: if permission → query, cap 5
   identity-based selection, query-dependent order)                ▼
                                              command-search.queries.ts  (composes feature barrels)
                                   searchTerritories · searchBuildings · searchMyAttributions
                                   searchPublishers · searchEvents · searchDocuments
```

### 5.1 Static command registry — `shared/ui/command-palette/command-registry.ts`

Client-safe, pure. Input = the `AppSidebarPermissions` **boolean bag** (registry = bag; endpoint =
Set — stated explicitly to avoid ambiguity).

- `CommandEntry = { id; group; label; icon; keywords?: string[] } & ({ kind:'navigate'; to } |
  { kind:'action'; run } | { kind:'form'; formTo; method })`. `keywords` powers matching beyond the
  label ("params retention" → congregation settings).
- `buildStaticCommands(bag)` returns:
  - **Navigation** — the current items **plus deep links**, each gated by the *same guard the route
    uses* (enumerate & mirror; note `canManageSettings` maps to `Permission.Admin`): `/settings/general`,
    `/settings/territories`, `/settings/territories/card-overlays`, `/settings/congregation`,
    `/settings/audit-log`, `/settings/data`, `/settings/permissions`, plus existing module sub-sections.
  - **Actions — quick-create** (navigate, gated by the *manage* permission): New territory
    `/territories/new`, New attribution `/territories/attributions/new`, New building
    `/territories/buildings/new`, New event, New user `/settings/users/new`, New role
    `/congregation/roles/new`, Upload document `/board/documents/new`.
  - **Actions — session/UI:** Toggle dark mode (`kind:'action'`; reuse ThemeToggle logic extracted to
    `use-theme.ts`; icon reflects current theme), Log out (`kind:'form'` → fetcher POST `/logout`), Go
    to my profile.
- Icons reconciled with the **sidebar** vocabulary (Territoires → `Map`; Mes attributions →
  `CalendarCheck`; Immeubles → `Building2`; Publicateurs → `Users`; Événements → `CalendarDays`;
  Documents → `FileText`; Log out → `LogOut`). Quick-create uses the `Plus`/`UserPlus`/`CalendarPlus`/
  `FolderPlus` family consistently.

### 5.2 Server search endpoint — `features/command-palette/routes/command-search.tsx`

Registered in `app/routes.ts` as `route('api/command-search', …)` **inside** the `_authenticated-layout`
children (inherits `requireAuth` + all three contexts — confirmed).

- Loader: read `permissionsContext` (Set) + `currentAccountContext`; parse `?q=`, **echo `q` back** in
  the JSON. Min length 2 (allow 1 char when purely numeric — single-digit territory/building numbers).
  One `withScopeFromContext` (RLS `SET LOCAL` mandatory); the per-type queries run on one connection
  (serialized, **not** parallel — mind the 5s tx timeout). **Only query a type when its viewer
  permission is present**, else skip silently. Cap each type at 5; return per-type `hasMore` so the UI
  can offer "+N autres".
- **Gating map:** territories/attributions → `TerritoriesViewer`; buildings → `ProspectionViewer`;
  publishers → `PublisherViewer`; events → `ProgramViewer`; documents → `BoardViewer`; my-attributions
  additionally needs `member?.id`. Uses `if (permissions.has(...))`, **not** `requirePermission` (which
  redirects). This is the enforcement point for the §2 role-gating invariant.
- Orchestration in `features/command-palette/server/command-search.queries.ts` (read-only; imports each
  feature's `index.server` barrel — legal for any feature per `eslint.config.js` boundaries). Maps rows
  → `{ id, label, sublabel?, to, actions?: {id,label,icon,to}[] }`. **Sublabels are effectively required**
  for people/buildings/documents (disambiguation): publisher → group; territory → address/attributee;
  building → street; event → date; document → section.

### 5.3 Recents — `shared/ui/command-palette/recents.ts`

Client-safe MRU (~8) of `{ id, label, sublabel?, to, groupKey }` in localStorage; pushed on any palette
navigation. Pure list logic unit-tested; storage guarded for SSR. Shown in the empty (no-query) state.

### 5.4 Palette UI — accessible, grouped, stateful

Rework `CommandPalette.tsx` and **split rendering** into `CommandGroup.tsx` / `CommandRow.tsx` +
pure `command-list.ts` to stay under the 400-line budget.

**Selection & fetching.** Single `useFetcher().load('/api/command-search?q=…')`, debounced 200ms
(`.load()` auto-aborts the prior request; additionally drop any response whose echoed `q` ≠ current
input). **Identity-based selection** — track the selected entry `id`, derive the index from it;
streaming results must **never move or steal** the highlight, and must not reset to index 0. Default
selection = best-ranked row. `command-list.ts` (pure, tested): filter/rank/flatten + group assembly +
active-id → index; light relevance (exact/prefix beats substring).

**Ordering (query-state dependent).**
- *Empty query:* Recents → Quick actions → primary Navigation shortlist → one-line hint "Tapez pour
  rechercher territoires, publicateurs, immeubles, événements…". No search groups.
- *Active query:* live entity groups **first** (Territoires, Mes attributions, Publicateurs, Immeubles,
  Événements, Documents), then a single "Aller à / Actions" block of matching static entries.

**State matrix (explicit).**
- `q < min` → empty-state content; never "Aucun résultat".
- Debounce pending → keep previous results (no flash).
- In-flight → `Loader2` spinner at the input's right; **do not clear** existing results; per-group
  skeletons only on the *first* query.
- Zero results but static matches → show static, suppress empty search groups.
- Zero everywhere → single "Aucun résultat pour «{q}»" + `SearchX` + hint.
- **Error / network failure** → static commands keep working; a quiet "Recherche indisponible" line
  replaces the search groups (never a silently-broken box).
- On close → clear fetcher data (no stale flash on reopen); return focus to the trigger.

**Accessibility (hand-rolled, full ARIA).** Input `role="combobox"` + `aria-expanded` +
`aria-controls` + `aria-activedescendant` (active option id). List `role="listbox"`. Rows
`role="option"` + `aria-selected` on a **`div`** (not `<button>` — so the inner action buttons are
valid HTML). `aria-live="polite"` announcing result counts. Verify focus restoration on close (opened
programmatically via ⌘K). Manual VoiceOver pass (no component tests — see §11).

**Visual (tokens/classes).** Taller dialog `max-h-[min(30rem,65vh)]`, anchor `top-[10%]`; sticky
opaque group headers. Header vs sublabel differentiated (`text-[11px] uppercase tracking-wider` vs
`text-xs text-muted-foreground truncate`); groups separated by `mt-2 first:mt-0`, at most one
`border-t` between the static and live blocks. **Selected ≠ hover** — because `accent` and `muted` are
the *same* token, the keyboard-active row gets `data-[selected=true]:bg-accent` **+ a left marker**
`border-l-2 border-primary`, hover gets `hover:bg-accent/50`; hover-selection is suppressed during
keyboard nav until the mouse moves. Two-line rows: `flex flex-col min-w-0` + `truncate` both lines,
icon `shrink-0 self-start`. Per-type icons on results. Log out uses `hover:text-destructive` (**not**
`text-destructive-foreground`, which equals `destructive` in this theme). Mobile: `min-h-[44px]`
rows, tap-to-select, scroll above the keyboard. Input clear-"X" button (shares the spinner slot).

**Contextual actions (in-row icon buttons — decided).** Only on entity result rows, only for the
**keyboard-active** row, revealed via `opacity-0 data-[selected=true]:opacity-100` (no height change →
no reflow). Right-aligned ghost icon-buttons (`size-7`, lucide icon, French `aria-label`/tooltip),
permission-gated per action (e.g. a territory → "Voir sur la carte", "Gérer l'attribution").
**Keyboard contract:** `Enter` = open the row's `to`; `→` enters the active row's action buttons
(roving focus); `←` / first `Esc` returns to the list, second `Esc` closes; `↑/↓` skip headers, clamp
(no wrap). Actions are also mouse-clickable. **"+N autres — affiner"**: when a type has `hasMore`, a
trailing row deep-links to that module's list filtered by `q` (reusing existing list pages).

## 6. Role-gating model (the hard invariant)

Two enforcement points, one rule:

- **Static entries** (nav + actions): gated in `buildStaticCommands` by the boolean bag, mirroring each
  destination route's own guard.
- **Search results**: gated in the endpoint by the `Set<Permission>` (the gating map in §5.2), which
  simply **does not run** a type's query without its viewer permission → the group can't appear.

Because the endpoint never queries an unauthorized type, role-gating for search is structural, not
cosmetic — there is no client-side list to leak. `Admin` expands to all permissions upstream
(`resolveEffectivePermissions`), so admins see everything with no special-casing.

## 7. Search query functions (per feature)

Each `(db, congregationId, q, limit)` (attributions also takes `memberId`), returns a minimal shape,
exported via its feature's `index.server.ts` (add the exports). **TDD-first**, co-located tests.

- `features/territories/server/`: `searchTerritories`, `searchBuildings` (both via
  `computeFilters(new URLSearchParams({ search: q }))`), `searchMyAttributions(…, memberId, …)`.
- `features/publishers/server/`: `searchPublishers` (normalized columns + `stripDiacritics`).
- `features/events/server/`: `searchEvents` (fresh `name`/`description` `OR`; **no** date filter).
- `features/display-board/server/`: `searchDocuments` (`title`; visibility window for non-managers).

All read-only → `.queries.ts` placement; no `create/update/delete`, so `test:aggregate-boundaries` and
CQRS-lite are satisfied. The orchestrator `command-search.queries.ts` is also read-only and needs its
own co-located test (`test:service-test-coverage` covers `.queries.ts`).

## 8. Data & code changes

**No schema changes.** No new dependency.

**Create**

- `shared/ui/command-palette/`: `command-registry.ts` (+test), `command-list.ts` (+test), `recents.ts`
  (+test), `use-theme.ts` (extracted from ThemeToggle), `CommandGroup.tsx`, `CommandRow.tsx`.
- `features/command-palette/routes/command-search.tsx`,
  `features/command-palette/server/command-search.queries.ts` (+test).
- Per-feature search query fns + tests (§7).

**Modify**

- `shared/ui/CommandPalette.tsx` — fetcher, ordered/grouped rendering, ARIA, state matrix, contextual
  actions, recents (kept thin via the new subcomponents).
- `shared/ui/ThemeToggle.tsx` — use the extracted `use-theme` hook (no behavior change).
- `app/routes.ts` — register `api/command-search` under the authenticated layout.
- Touched features' `index.server.ts` — export the new search fns.
- `app/i18n/messages/{en,fr}.json` — group headers, action labels ("Nouveau territoire", "Se
  déconnecter", "Basculer le thème"…), contextual labels, "Recherche…", "Recherche indisponible",
  "Aucun résultat pour «{q}»", the empty-state hint, "+N autres". French is source of truth.

Note: `features/command-palette/index.server.ts` is optional (the route uses a same-feature interior
import); any client `index.ts` must stay free of server re-exports (`test:server-barrel-exports`).

## 9. Permissions

Reuses existing `Permission` values only; **no new permission**. View-gating map in §5.2. Quick-create
actions gated by the corresponding *manager* permission; session/UI actions ungated (available to any
authenticated user).

## 10. Phasing

1. **Search core + registry + palette rewrite** — `command-registry` (nav deep-links + quick-create +
   session/UI actions), the endpoint + all six search query fns, and the accessible grouped palette
   (ordering, state matrix, ARIA, recents). Ships the whole user-visible value together.
2. **Contextual in-row actions** — the `→`-into-actions interaction + per-entity action sets +
   "+N autres" overflow links. Split out only if phase 1 review wants the search core proven first;
   otherwise fold into phase 1.

Inline entity mutations remain out of scope (§2).

## 11. Testing

- **Pure fns** (`command-registry`, `command-list`, `recents`, `use-theme` logic): unit-tested, black-
  box, sentinel ids — assert on returned values, never spies (per project convention).
- **Search query fns + orchestrator**: **failing test first**, watch fail, implement. Cover the
  role-gating skip (no permission → type absent), the nullable-member skip for attributions, the
  document visibility window, diacritics folding, and the `hasMore`/cap behavior. Integration test with
  a seeded congregation for RLS scoping.
- **No React component tests** (project convention) — interaction/ARIA verified manually incl. a
  VoiceOver pass; the async-selection-stability and stale-response guards are exercised by hand (fast-
  typing, killed endpoint).
- Gates after each slice: `pnpm test:unit && pnpm test:lint && pnpm test:typecheck`;
  `pnpm test:service-test-coverage`; `pnpm test:boundaries` + `pnpm test:server-barrel-exports`; watch
  `CommandPalette.tsx` against the file-size budget.

## 12. Open questions

1. **Empty-state nav shortlist** — which ~5–6 destinations lead the no-query state (top by role? a
   fixed curated set?). Lean: role-aware fixed set (Accueil, Territoires, Publicateurs, Programmes,
   Réglages) filtered by permission.
2. **"+N autres" target** — do the module list pages all accept the same `?search=` param the palette
   would deep-link to? Needs a quick per-module confirm (territories/buildings/publishers do; events'
   list is date-filtered — may need a param).
3. **Recents privacy** — recents persist entity labels (names/addresses) in localStorage on a possibly
   shared device. Acceptable, or gate behind a setting / cap TTL? Lean: acceptable, labels only, no
   ids that survive a logout wipe — confirm.
4. **Mobile discoverability** — is ⌘K on mobile (sidebar search button only) enough, or should the
   palette also surface a persistent search affordance in the mobile header? Assumed button-only for
   v1.
