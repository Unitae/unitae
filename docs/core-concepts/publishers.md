# Publishers

The publishers module manages congregation member profiles, organizes them into field service groups, and tracks monthly activity.

## Publisher Profiles

A **publisher** is a congregation member who participates in field ministry. User accounts can be marked as publishers to enable activity tracking and group assignment.

### Profile Information

Each publisher profile includes:

- **Prénom / Nom** — First and last name
- **Email / Téléphone / Adresse** — Contact details
- **Date de naissance** — Birth date
- **Date de baptême** — Baptism date
- **Genre** — Homme or Femme, used for gender-specific assignments
- **Profil du proclamateur** — Publisher type (see below)
- **Nomination** — Whether the publisher is an ancien (elder) or assistant (ministerial servant) in the congregation
- **Le proclamateur est oint** — Anointed status

### Publisher Types

The *Profil du proclamateur* field offers:

- **Proclamateur** — Regular publisher (default)
- **Pionnier auxiliaire** — Temporary full-time minister (can be toggled on/off in congregation settings)
- **Pionnier permanent** — Full-time minister
- **Pionnier spécial** — Special pioneer
- **Missionnaire** — Missionary

## Publisher Groups

Publishers are organized into **groups** (field service groups). Each group has:

- **Nom** — The group's display name
- **Adresse** — Meeting location for the group
- **Responsable** — The group leader (typically an elder)
- **Adjoint** — The assistant group leader
- **Members** — Publishers assigned to the group

Groups help organize field service and track activity at the group level.

## Activity Tracking

Monthly field service reports are recorded for each publisher.

### Activity Records

Each monthly record includes:

- **Mois concerné / Année** — The reporting period
- **Heures** — Hours spent in field ministry
- **Études** — Number of Bible studies conducted
- **Service de pionnier** — Type of pioneer service performed that month
- **Le proclamateur a préché ce mois** — Whether the person was active that month
- **Observations** — Optional notes

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
