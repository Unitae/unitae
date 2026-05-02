# Publishers

The publishers module manages congregation member profiles, organizes them into field service groups, and tracks monthly activity.

## Publisher Profiles

A **publisher** is a congregation member who participates in field ministry. User accounts can be marked as publishers to enable activity tracking and group assignment.

### Profile information

Each publisher profile includes:

- **First name / Last name**
- **Email / Phone / Address** — Contact details
- **Date of birth**
- **Baptism date**
- **Gender** — Male or female, used for gender-specific assignments
- **Publisher type** — See below
- **Appointment** — Whether the publisher is an elder or ministerial servant in the congregation
- **Anointed** — Anointed status

### Publisher types

The *Publisher type* field offers:

- **Publisher** — Regular publisher (default)
- **Auxiliary pioneer** — Temporary full-time minister (can be toggled on/off in congregation settings)
- **Regular pioneer** — Full-time minister
- **Special pioneer**
- **Missionary**

### Territory assignments

The publisher profile displays the list of territories currently assigned to the publisher. For each active assignment, the view shows:

- **Number** — The territory number (links to the territory view if the user has the `TerritoriesViewer` role)
- **Type** — The territory type (Door to door, Businesses, etc.)
- **Checkout date** — When the assignment started
- **Status** — Whether the assignment is on time or overdue

## Publisher Groups

Publishers are organized into **groups** (field service groups). Each group has:

- **Name** — The group's display name
- **Address** — Meeting location for the group
- **Responsible** — The group leader (typically an elder)
- **Deputy** — The assistant group leader
- **Members** — Publishers assigned to the group

Groups help organize field service and track activity at the group level.

## Activity Tracking

Monthly field service reports are recorded for each publisher.

### Activity Records

Each monthly record includes:

- **Month / Year** — The reporting period
- **Hours** — Hours spent in field ministry
- **Studies** — Number of Bible studies conducted
- **Pioneer service** — Type of pioneer service performed that month
- **Publisher was active this month** — Whether the person was active that month
- **Notes** — Optional notes

### Theocratic Year

Activity statistics follow the **theocratic year**, which runs from September to August (not January to December).

## Reports and Exports

- **Individual PDF reports** — Activity report for a single publisher
- **Batch PDF export** — All publisher reports as a ZIP file
- **Yearly Excel export** — Full year activity summary for all publishers in a spreadsheet

## Permissions

| Role | Can do |
|------|--------|
| `PublisherViewer` | View publisher profiles and group information |
| `PublisherManager` | Create, edit, and deactivate publishers. Manage groups |
| `ActivityViewer` | View activity reports and statistics |
| `ActivityManager` | Record, edit, and export publisher activity |
| `Admin` | Everything |

See [Roles and Permissions](roles-and-permissions.md) for the full list of roles across all features.

## Related

- [Territories](territories.md) — Territory attributions are linked to publishers
- [Feature Overview](feature-overview.md) — See all features at a glance
