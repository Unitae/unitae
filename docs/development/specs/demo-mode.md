# Demo mode

A visitor of the hosted service can open their own copy of the demo congregation, signed in as the role they choose,
without creating an account. The copy is short-lived and deleted on its own. This spec covers the app's side; creating
and deleting the copies is done by the hosted service's control plane.

The mode is off unless `UNITAE_DEMO=true`. It isn't meant for self-hosted instances, and isn't documented for them.

## What a visitor gets

- **Their own copy** of the demo congregation (about 110 publishers, generated, invented people and places). Nobody
  else sees what they do in it.
- **A role**: Coordinateur (administrator), Secrétaire, Responsable des programmes, Préposé aux territoires,
  Responsable de groupe or Proclamateur. They can switch to another role inside the same copy.
- **A copy that lasts while they use it**: an hour without activity, 24 hours after its creation at most.

## Every demo screen is marked

A copy can hold anything a visitor types, and a screenshot of it can't be prevented. Every screen says it's a demo:

- a banner on every page, on a phone too, which can't be closed: « Démo — données inventées », the role, « changer de
  rôle », « créer votre assemblée »;
- « Démo » in the header of every PDF and printed document;
- the congregation's data is invented, and its name says it's a demo.

## What a copy refuses

When a congregation is a demo copy (`Congregation.demoExpiresAt` set) and the mode is on:

- no e-mail leaves the app;
- no PDF upload, no import;
- no password, two-step verification, e-mail address or account change, no invitation, no account deletion;
- the rest works, exports included: the data is invented.

## Pieces

1. **The seed as a function**: `seedDemoCongregation(prisma, congregation, { now, emailSuffix, log })` in
   `app/database/demo/seed-demo.ts`. The marketing seed (`pnpm db:seed:marketing`) uses it for its congregation; a copy
   uses it with a suffix that keeps its logins' addresses unique (`marc.dupont+x7k2p@demo.unitae.app`). It takes
   about 4 seconds.
2. **Schema**: `Congregation.demoExpiresAt` and `demoReadyAt`; `DemoSignInToken` (hashed token, congregation, role,
   expiry, used at).
3. **The guards and the banner** above.
4. **Entry**: `/demo/enter?token=…` checks a one-time token (a minute, single use, for that congregation) and signs
   the visitor in as the copy's account for the role; « changer de rôle » does the same for another role; each request
   pushes the expiry (written at most once a minute); `/cron/demo-seed` fills the copies not yet seeded.
