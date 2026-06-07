# Publishers

The publishers module manages congregation member profiles, organizes them into field service groups, and tracks monthly activity.

## Publisher Profiles

A **publisher** is a congregation member who participates in field ministry. The Publishers list also shows ministry-school students — people who are part of the congregation and can be assigned to programme parts (e.g., student talks) but aren't yet declared publishers. Publishers and students share the same profile shape; the only difference is the *Publisher* status flag.

A publisher does not need a login. You can create a publisher profile without any email — they appear in attribution dropdowns, group rosters, and activity reports the same way. Add a login later from the profile if they get an email account.

### Profile information

Each publisher profile includes:

- **First name / Last name**
- **Email** — Optional. When provided, the publisher gets a login account; when blank, they exist as an offline profile only.
- **Phone / Address** — Contact details
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

- **Number** — The territory number (links to the territory view for members with the Territories Viewer permission)
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

## Lifecycle: present, inactive, left, anonymized

Publishers (and ministry-school students) have four independent lifecycle states:

- **Present** — The default. Appears in selectors, attribution dropdowns, group rosters, and activity prompts.
- **Inactive** — The publisher is still in the congregation but has reported "did not preach" for six consecutive monthly activity reports. They keep their group membership, role assignments, and full visibility for elders and managers, but they are hidden from the public-facing display board (group rosters and pioneer lists) and excluded from the active-publisher count in stats. The flag is set automatically when the sixth consecutive missed-preach report is filed, and clears silently the next time an hours report arrives. A publisher manager can also toggle it manually (e.g. for a publisher who moved or is on long-term illness leave) from the Pause/Play button on the publisher view or edit page. An amber **Inactif** badge appears next to the publisher's name when this state is active. *Note*: a missing monthly report does not count toward the streak — only an explicit "did not preach" entry filed by the elder does.
- **Left** — Marks the person as no longer part of the congregation. They disappear from publisher-facing lists and the system stops asking for their monthly activity. Past data (attributions, activity reports, group history) is preserved untouched. Reversible: marking them as returned brings everything back exactly as it was.
- **Anonymized** — Permanent GDPR scrub. Personal information (name, contact, dates, gender) is wiped from the profile while activity numbers are kept (without name) for congregation statistics. Irreversible.

Inactive and left are orthogonal: a publisher can technically be both, though the UI only surfaces the "left" controls in that case — on return, the previous inactive flag is preserved. Anonymization is a manual action available from the admin Users list — there is no automatic retention cron yet. Mark someone as left first, then anonymize once you've decided you no longer need their identifying data.

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

### Irregular and inactive publishers

The monthly activity list highlights publishers whose most recent report indicates they did not preach (red row, "irregular"). When a publisher accumulates six such reports in a row, they are automatically marked **inactive** (see [Lifecycle](#lifecycle-present-inactive-left-anonymized) above) and the row switches to a muted gray with a small "Inactif" pill. The next time they file an hours report, the inactive flag clears silently and the row goes back to its normal style.

### Theocratic Year

Activity statistics follow the **theocratic year**, which runs from September to August (not January to December).

## Reports and Exports

- **Individual PDF reports** — Activity report for a single publisher
- **Batch PDF export** — All publisher reports as a ZIP file
- **Yearly Excel export** — Full year activity summary for all publishers in a spreadsheet

## Login (optional)

A publisher with an email gets a login account that's tied to their profile. From the profile page, you can:

- **Add login** — Set an email and send the publisher a password-reset email. They'll be able to log in to the app afterwards.
- **Remove login** — Delete the login account but keep the profile. The publisher remains in all lists and reports; they just can't sign in anymore.

The two operations don't affect each other's data: you can swap an email or remove the login without losing attribution history, group membership, or activity reports.

## Permissions

| Permission | Can do |
|---|---|
| Publisher Viewer | View publisher profiles and group information |
| Publisher Manager | Create, edit, and deactivate publishers. Manage groups |
| Activity Viewer | View activity reports and statistics |
| Activity Manager | Record, edit, and export publisher activity |
| Admin | Everything |

See [Roles and Permissions](roles-and-permissions.md) for the full list of permissions across all features.

## Related

- [Territories](territories.md) — Territory attributions are linked to publishers
- [Feature Overview](feature-overview.md) — See all features at a glance
