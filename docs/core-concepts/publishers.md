# Publishers

The publishers module manages congregation member profiles, organizes them into field service groups, and tracks monthly activity.

## Publisher Profiles

A **publisher** is a congregation member who participates in field ministry. User accounts can be marked as publishers to enable activity tracking and group assignment.

### Profile Information

Each publisher profile includes:

- **Personal details** — Name, email, phone, address, birth date
- **Baptism date** — Date of baptism
- **Publisher type** — Regular publisher, pioneer, or auxiliary pioneer
- **Spiritual status** — Elder, ministerial servant, or anointed
- **Gender** — Used for gender-specific assignments
- **Active status** — Whether the publisher is currently active

### Publisher Types

- **Publisher** — Regular publisher
- **Pioneer** — Full-time minister
- **Auxiliary Pioneer** — Temporary full-time minister (can be toggled on/off in congregation settings)

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

- **Month and year** — The reporting period
- **Hours** — Hours spent in field ministry
- **Bible studies** — Number of Bible studies conducted
- **Activity type** — Type of ministry performed
- **Publisher status** — Whether the person was an active publisher that month
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
