# Demo mode

A visitor of the hosted service can open their own copy of the demo congregation, signed in as the role they choose,
without creating an account. The copy is short-lived and deleted on its own. This spec covers the app's side; creating
and deleting the copies is done by the hosted service's control plane.

The mode is off unless `UNITAE_DEMO=true`. It isn't meant for self-hosted instances, and isn't documented for them.

## What a visitor gets

- **Their own copy** of the demo congregation (about 110 publishers, generated, invented people and places). Nobody
  else sees what they do in it.
- **A role**: Coordinateur du collège des anciens, Secrétaire (both administrators, as in the marketing demo),
  Responsable de la réunion Vie chrétienne et ministère, Préposé aux territoires, Responsable de groupe or
  Proclamateur. They can switch to another role inside the same copy.
- **A copy that lasts while they use it**: an hour without activity. Its expiry is never pushed past 24 hours after
  the copy was ready, the time it waited in the pool included.

## Every demo screen is marked

A copy can hold anything a visitor types, and a screenshot of it can't be prevented. Every screen says it's a demo:

- a banner on every page, on a phone too, which can't be closed: « Démo — données inventées », the role, « changer de
  rôle », « créer votre assemblée ». Its link to registration carries `?from=demo&role=…`, so the hosted site counts
  the congregations the demo brought. Three minutes after the visitor's first page (counted in the tab's session
  storage), it adds « Ça vous convient ? Créez votre assemblée : 14 jours d’essai gratuit, sans carte bancaire. »;
- « Démo — données inventées » in the top corner of every page of every PDF it prints: each `<Page>` carries a
  `PdfDemoMark`, which prints only when `renderPdfResponse` or `renderPdfBuffer` is called with `{ demo: true }`, as
  every PDF route does for a copy. The board's shared PDFs carry it too. Visitors can't upload, so a copy holds no
  other PDF;
- the congregation's data is invented, and the control plane names it « Assemblée de démonstration ».

## What a copy refuses

A copy never sends e-mail: a visitor can type any address on a member or a speaker congregation. The notification
worker and « Notre liste » skip any congregation with `demoExpiresAt` set, whatever the mode's flag. On top of that,
`sendEmail` drops the demo's invented addresses (`@demo.unitae.app`, and the reserved `example.*` domains its speakers
use) in every installation, promoting a real copy recipient when the main one is invented.

When a congregation is a demo copy (`Congregation.demoExpiresAt` set) and the mode is on, the signed-in layout's
middleware (`refusedInDemoCopy`) turns away, with or without JavaScript:

- any submission with a multipart body: board documents and their versions, speaker lists, the archive import;
- changing, creating or removing a login: `/me/security`, `/settings/users/new`, an account's page, its deletion,
  2FA reset, anonymisation and « ajouter à l'assemblée », linking or unlinking a record's login, invalidating a
  password;
- the congregation archive in or out (`/settings/data`);
- sending « Notre liste » (its `send` intent).

A refused submission goes back to its page with « Pas disponible dans la démo ». The rest works: the data is invented.
The board's PDFs are shared by every copy (`demo-shared/`), and `deleteBoardFile` never deletes them, so a visitor
deleting a document doesn't take it away from the others.

A copy's logins get a password nobody knows: the one-time link is the only way in.

## Pieces

1. **The links back to the hosted site**: `HOST_SETTINGS.demo.registerUrl` (« créer votre assemblée ») and
   `HOST_SETTINGS.demo.demoUrl` (an expired link's « ouvrir une nouvelle démo »).
2. **The seed as a function**: `seedDemoCongregation(prisma, congregation, { now, emailSuffix, log, demoLogins,
   sharedBoardFiles })` in `app/database/demo/seed-demo.ts`. The marketing seed (`pnpm db:seed:marketing`) uses it for
   its congregation; a copy uses it with its slug as the suffix that keeps its logins' addresses unique
   (`marc.dupont+demo-x7k2p@demo.unitae.app`). It takes about 4 seconds (measured on the marketing seed). With
   `demoLogins`, it records the login of each role in the `demoAccounts` setting: the coordinator, the secretary, the
   elder in charge of the midweek meeting, the territory servant (never a group overseer: the seed keeps them
   apart), a group overseer who holds none of those roles, and a publisher or pioneer who already signs in and
   holds no role nor group (a sister, in the demo: every brother with a login serves somewhere), with a territory in
   hand and the most coming assignments (when she has none in the next three weeks, she takes a sister's place in a
   demonstration, so her home page lists one), each a login of their own, verified and
   consented. With `sharedBoardFiles`, the board's documents point at the shared files.
3. **Schema**: `Congregation.demoExpiresAt` and `demoReadyAt`; `DemoSignInToken` (hashed token, congregation, role,
   expiry, used at), with the tenant RLS policy.
4. **Filling**: `/cron/demo-seed` fills the copies not ready and not yet expired, a few per run. A seed that fails
   leaves a half-filled copy, which can't be seeded again: it's marked expired, and the control plane replaces it. The
   route answers 500 when every copy of the run failed.
5. **Entry**: `/demo/enter?token=…` spends a one-time token (a minute, single use, for that congregation) and signs
   the visitor in as the copy's login for the role, checked to be the copy's own. A used or expired link, a copy past
   its expiry or already deleted, gets the expired page with « ouvrir une nouvelle démo »; each refusal logs its
   reason. « Changer de rôle » (`/demo/role`) signs in as another role's login of the same copy.
6. **While it's used**: the signed-in layout's middleware pushes the expiry an hour on, on every request (client-side
   navigation included), written at most once a minute; a failed push never fails the page. The banner names the
   role.
