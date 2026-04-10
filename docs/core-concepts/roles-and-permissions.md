# Roles and Permissions

Unitae uses a fine-grained role system to control who can access and manage each feature. Roles are assigned per user and scoped to the congregation.

## The 14 Roles

| Role | Access granted |
|------|---------------|
| **Admin** | Full access to all features within the congregation |
| **BoardUploader** | Upload documents to the display board |
| **BoardValidator** | Manage board documents: edit, delete, set visibility, highlight. Manage sections |
| **TerritoriesViewer** | View territory list, attributions, and statistics |
| **TerritoriesManager** | Create, edit, and delete territories. Manage attributions. Trigger open data sync |
| **ProspectionViewer** | View building prospection data |
| **ProspectionManager** | Edit buildings, update prospection data, manage building status |
| **SettingsUserManager** | Create, edit, and deactivate users. Assign roles |
| **PublisherViewer** | View publisher profiles and group information |
| **PublisherManager** | Create, edit, and deactivate publishers. Manage groups |
| **ActivityViewer** | View activity reports and statistics |
| **ActivityManager** | Record, edit, and export publisher activity |
| **ProgramViewer** | View events and programs |
| **ProgramManager** | Create, edit, and delete events. Manage event kinds |

## How Roles Work

### Multiple Roles Per User

A user can have any combination of roles. For example, an elder might have `TerritoriesManager`, `PublisherManager`, `ActivityManager`, and `ProgramManager` — giving them access to manage territories, publishers, activity, and programs without full admin access.

### Admin Role

The `Admin` role grants access to everything. Users with this role bypass all other role checks. It also grants access to congregation settings (display name, territory configuration, event kinds).

Typically, only a few trusted users should have the Admin role.

### Viewer vs Manager Roles

Most features have a **viewer** and a **manager** role:

- **Viewer** roles grant read-only access (view lists, read details, see reports)
- **Manager** roles grant full access (create, edit, delete, export)

Manager roles implicitly include viewer access — you don't need to assign both.

## Managing Roles

Roles are assigned through **Settings > Users**. To manage user roles, you need either the `SettingsUserManager` or `Admin` role.

From the user management page, you can:

1. View all users in the congregation
2. Select a user to see their current roles
3. Add or remove roles
4. Create new users with initial role assignments

## Default Access

Every authenticated user can:

- View the display board (visible documents)
- Record their own days off
- Access their own profile

Everything else requires at least one role assignment.
