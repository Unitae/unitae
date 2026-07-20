# Roles and Permissions

Unitae lets you decide, precisely, who in the congregation can see what and who can change what. Two ideas work together:

- **Permissions** are the small units of access — for example, *manage territories*, *upload documents to the board*, *view publishers*. There are 20 of them, each tied to one feature.
- **Roles** are named bundles of permissions you assign to a person — for example, *Elder*, *Pioneer team lead*, or anything else you want to call it. A user can hold several roles, and gets the union of their permissions.

You can keep things simple and stick to the built-in roles, or you can create your own roles when the built-ins don't fit how your congregation is organised.

## Built-in roles

These roles ship with every congregation. The system assigns and removes them automatically based on the publisher profile fields (publisher, baptized, anointed, elder, etc.) — you don't manage their membership by hand.

| Role | Who gets it |
|---|---|
| Member | Anyone in the publisher list (publishers and ministry-school students alike) |
| Ministry-school student | Someone in the publisher list who isn't yet declared a publisher |
| Publisher | Anyone marked as a publisher |
| Baptized | Publishers with a baptism date |
| Brother | Anyone baptized whose profile is marked male |
| Sister | Anyone baptized whose profile is marked female |
| Anointed | Publishers marked as anointed |
| Elder | Baptized males marked as elder |
| Assistant servant | Baptized males marked as assistant servant |
| Pioneer | Publishers serving as auxiliary or regular pioneers |

A few things worth noting about how membership is computed:

- **Brother / Sister** are no longer publisher-gated. A baptized non-publisher (for instance someone who's just moved in but hasn't yet been added to the local publisher record) still counts.
- **Member** and **Ministry-school student** were added when the system started supporting people enrolled in the ministry school but not yet declared publishers — so a school student can now be picked as a candidate for a school talk without first being marked as a publisher.
- When someone is **marked as left** the congregation, every built-in role assignment is removed automatically. When they return, the assignments come back from their stored profile flags.

These roles come **without permissions attached by default**. Their main job is to let you **target communications and assignments** — for example, restricting a board section so only elders can see it, or filtering programme assignments to baptized publishers only.

If you want a built-in role to actually grant access (say, give every elder the right to validate board documents), open the role and tick the permissions you want it to carry.

## Custom roles

You can create as many roles of your own as you need. A custom role has:

- A name (and an optional description, useful for explaining the role to other admins)
- Any combination of the 20 permissions
- The list of users who hold it

Typical examples: *Service committee*, *PR coordinator*, *Group overseer*. Whatever names match how your congregation actually works.

To create a role: **Settings → Roles → New role**. Pick the permissions, save, then assign users from their profile.

You can edit, rename, and delete custom roles at any time. Built-in roles cannot be renamed or deleted (the system depends on their identity).

## The 20 permissions

Permissions are grouped by area of the app. Most areas come in two flavours: **Viewer** (read-only) and **Manager** (full access). Holding a Manager permission already includes everything a Viewer permission would grant — you don't need to assign both.

### Display board
- **Board Viewer** — open the board and read documents
- **Board Uploader** — add new documents to the board, edit or delete versions of documents you uploaded
- **Board Validator** — manage any board document (edit, delete, set visibility, highlight), manage sections and their visibility rules, add dynamic documents

### Territories
- **Territories Viewer** — open the territory list, attributions, and statistics
- **Territories Manager** — create, edit and delete territories, manage attributions, trigger the open-data sync
- **Prospection Viewer** — open the building prospection screens
- **Prospection Manager** — edit buildings and update prospection data

### Publishers
- **Publisher Viewer** — open publisher profiles and group information
- **Publisher Manager** — create, edit, deactivate publishers, manage groups
- **Activity Viewer** — read the monthly activity reports and statistics
- **Activity Manager** — record, edit, and export publisher activity

### Programme & events
- **Program Viewer** — open the events list, programmes, and templates
- **Program Manager** — create, edit, delete, release, and un-release events; assign publishers; manage programme templates
- **External Speaker Viewer** — open the external speaker registry
- **External Speaker Manager** — add, edit, archive speakers in the registry

### Settings
- **Settings User Manager** — create, edit, deactivate users; assign roles to users
- **Roles Viewer** — open the list of roles in the congregation
- **Roles Manager** — create, edit, delete custom roles and choose which permissions they carry
- **Permissions Manager** — adjust which permissions are attached to a role

### Admin
- **Admin** — full access to everything in the congregation, plus congregation-wide settings (display name, configuration, programme templates). Bypasses every other permission check.

Keep the **Admin** permission to a small handful of trusted users.

## How a person ends up with a permission

The flow is:

1. The person holds one or more roles (built-in roles assigned automatically, custom roles assigned by an admin).
2. Each role carries a set of permissions.
3. The person's effective permissions are the union of all their roles' permissions.

So to give someone access to a feature, you don't grant the permission directly — you put them in a role that already has it (or create a new role that does).

## Programme template responsible

Independently of roles, each programme template can delegate write access to two people:

- a **template responsible**, who can edit, delete, release, and un-release the events that come from that template and assign publishers to them — without needing the broader Program Manager permission; and
- a **template service responsible**, who can update only the services section of those events (assign services, edit their notes, add or remove service rows) and nothing else.

Useful for delegating one programme (e.g. midweek meeting) — or just its service scheduling — without handing over the rest.

## Default access

Users who have no roles assigned still have a small baseline:

- They can see and edit their own profile
- They can record their own days off
- They can subscribe to their personal calendar feed

Everything else — including viewing the board, territories, or publishers — requires the matching permission.

## Related

- [Display Board](display-board.md) — section visibility and the Board Viewer / Uploader / Validator permissions
- [Territories](territories.md) — Territories and Prospection permissions
- [Publishers](publishers.md) — Publisher and Activity permissions
- [Events](events.md) — Program and External Speaker permissions
- [Settings](settings.md) — where to assign roles and create new ones
- [Security](security.md) — how access checks are enforced
