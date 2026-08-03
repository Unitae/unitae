# Publishers

The publishers module manages congregation member profiles, organizes them into field service groups, and tracks monthly activity.

## Publisher Profiles

A **publisher** is a congregation member who participates in field ministry. The Publishers list also shows ministry-school students — people who are part of the congregation and can be assigned to programme parts (e.g., student talks) but aren't yet declared publishers. Publishers and students share the same profile shape; the only difference is the *Publisher* status flag.

A publisher does not need a login. You can create a publisher profile without any login — they appear in attribution dropdowns, group rosters, and activity reports the same way. You can still record a contact email on the profile without giving them a sign-in account, and add a login later from the profile if they need one.

### Profile information

Each publisher profile includes:

- **First name / Last name**
- **Email** — Optional **contact** email address. This is a detail on the profile (used, for example, on the [emergency roster](#emergency-preparedness-information)), and is **separate from a login**. Filling it in does not by itself create a sign-in account — a login is added separately (see [Login](#login-optional)), though it prefills from this contact email. On the profile it shows as a `mailto:` link.
- **Phone / Address** — Contact details
- **Date of birth**
- **Baptism date**
- **Gender** — Male or female, used for gender-specific assignments
- **Publisher type** — Reflects the publisher's pioneer service; set through appointments, not a dropdown (see [Pioneer service](#pioneer-service))
- **Appointment** — Whether the publisher is an elder or ministerial servant in the congregation
- **Anointed** — Anointed status

### Publisher types

Every publisher has a **type** that reflects their current standing:

- **Publisher** — Regular publisher (the default)
- **Auxiliary pioneer** — Serves as a pioneer for a limited time, with a personal monthly hour goal
- **Regular pioneer** — Full-time minister with an annual hour goal
- **Special pioneer**
- **Missionary**

You don't pick the type from a dropdown. It follows the publisher's **pioneer service**: appoint them (or enrol them for a month) and the type updates automatically. See [Pioneer service](#pioneer-service) below.

### Territory assignments

The publisher profile displays the list of territories currently assigned to the publisher. For each active assignment, the view shows:

- **Number** — The territory number (links to the territory view for members with the Territories Viewer permission)
- **Type** — The territory type (Door to door, Businesses, etc.)
- **Checkout date** — When the assignment started
- **Status** — Whether the assignment is on time or overdue

## Pioneer service

Pioneers are managed from the **Pioneer service** section of the publisher's edit page, not from a type dropdown — so a publisher's type and their real appointments always stay in sync. There are two ways a publisher serves as a pioneer.

### Standing appointment

A lasting appointment: **regular pioneer**, **special pioneer**, **missionary**, or **permanent auxiliary pioneer**. You choose the type and the start month, and the appointment runs until you close it. While it's active, the publisher's type reflects it and the section shows the appointment read-only with a **Close** control (you pick the closing month). Closing it returns the publisher to *Publisher*.

The **permanent auxiliary pioneer** option only appears when your congregation has enabled it in [congregation settings](settings.md#congregation-settings) — some congregations use a standing auxiliary status, others only the month-to-month form below.

### Monthly auxiliary enrolment

The classic auxiliary form: enrol a publisher for a **single month** with a **personal hour goal** (typically 15 or 30 h). A publisher signs up at the start of the month and their report lands at the end. A monthly enrolment does **not** change the publisher's standing type — it applies to that one month only — and you can remove it if it was added by mistake. It's always available, whatever the permanent-auxiliary setting.

### Goals, and seeing who's enrolled

Each pioneer type has a **default monthly hour goal** (regular ~50 h, auxiliary 30 h), set congregation-wide under [Pioneer goals](settings.md#congregation-settings). A monthly auxiliary enrolment can override it with a **per-person** goal (15 vs 30 h).

Because an enrolment is recorded separately from the hours report, a pioneer shows on the roster **before** their report arrives: an auxiliary who has signed up but not yet reported appears as *enrolled · report pending*, with the goal known and the hours still empty.

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

## Emergency-Preparedness Information

Congregations can record, per publisher, the information needed to react quickly in a crisis:

- **DPA card up to date** — whether the publisher's advance medical directive (*directive médicale anticipée*) is current
- **Survival backpack ready** — whether their emergency "go bag" is prepared
- **Emergency contacts** — a list of people to reach about the publisher, each with a **name**, a free-text **relationship** (family member, neighbour…), and a **phone number**

This appears as an **Emergency** card on the publisher's profile, and is edited from a dedicated *Emergency information* page.

### Who can see and edit it

Access comes from two independent sources, combined:

- **Group responsible and deputy** — automatically get to view *and* edit the emergency information of the members of **their own group**, with no extra permission needed. A group overseer can keep their own group's data current without holding any broader publisher permission.
- **Emergency Info Viewer / Emergency Info Manager** permissions — grant the same access **congregation-wide** (typically the coordinator or secretary). *Viewer* is read-only; *Manager* can also edit.

Admins can do everything, as always.

### Emergency rosters (PDF)

Two printable PDF rosters collect the emergency data in one place:

- **Whole-congregation roster** — every publisher's emergency data, reachable from the publishers list. Requires the Emergency Info Viewer or Manager permission.
- **Per-group roster** — a single group's emergency data, reachable from the group page. Available to the congregation-wide viewers/managers, and to that group's responsible or deputy.

Each roster lists the publisher's contact details (phone, address, contact email), DPA and backpack status, and their emergency contacts.

### Privacy

Emergency contacts are third-party personal data. They are wiped automatically when a member is [anonymized](#lifecycle-present-inactive-left-anonymized).

## Activity Tracking

Monthly field service reports are recorded for each publisher. The activity area lives under an **Activity** entry in the sidebar (and the command palette) and has two tabs: **Publishers** — the month-by-month entry list below — and **Pioneers** — the [pioneer monitoring roster](#pioneer-activity-monitoring). Both require the *Activity Viewer* permission.

### Activity Records

Each monthly record includes:

- **Month / Year** — The reporting period
- **Hours** — Hours spent in field ministry
- **Studies** — Number of Bible studies conducted
- **Pioneer service** — The pioneer type for that month, taken from the publisher's active enrolment (see [Pioneer service](#pioneer-service))
- **Publisher was active this month** — Whether the person was active that month
- **Notes** — Optional notes

### Irregular and inactive publishers

The monthly activity list highlights publishers whose most recent report indicates they did not preach (red row, "irregular"). When a publisher accumulates six such reports in a row, they are automatically marked **inactive** (see [Lifecycle](#lifecycle-present-inactive-left-anonymized) above) and the row switches to a muted gray with a small "Inactif" pill. The next time they file an hours report, the inactive flag clears silently and the row goes back to its normal style.

### Theocratic Year

Activity statistics follow the **theocratic year**, which runs from September to August (not January to December).

## Pioneer Activity Monitoring

Beyond the month-by-month list, the **Pioneers** tab gives service overseers a dedicated view to answer one question: *is each pioneer on pace to reach their service-year goal, and if not, who needs help first?* It works over a whole **service year** (September–August), with a year selector to look back.

### The pioneers roster

At the top, a **distribution bar** summarizes how many pioneers are on track, at risk, or behind, alongside the congregation's cumulative hours against the prorated target. Below it, pioneers are split into two sections.

**Regular / special pioneers and missionaries** — measured against an **annual** goal, prorated to how long they've been enrolled this year, and sorted most-at-risk first. Each row shows:

- The pioneer's **name**, group, and how many months they've been enrolled
- Their **type**
- A **status** badge — *On track*, *At risk*, or *Behind* — carrying the plain-language pace ("18 h ahead", "22 h behind", "On pace") measured against the target for the months elapsed so far
- **Hours** to date vs. the target to date (e.g. "312 / 350 h")
- A **trend** sparkline of monthly hours, with the target monthly rate drawn in as a reference line

Extra signals on top of pace:

- A **Report overdue** chip appears when the latest expected month hasn't been filed past the reporting grace window. An overdue report nudges the status one level worse — but never turns a genuine surplus into "behind".
- Rows for pioneers more than a month behind are tinted.
- At the very start of a service year, before there's enough data, rows read *Not enough data* rather than showing a misleading verdict.
- A pioneer who has stopped pioneering (their latest report is back to regular publisher) is marked **Concluded** with their final standing, and drops out of the risk counts.

**Auxiliary pioneers** are shown separately and are **informational only** — no on-track / behind verdict. An auxiliary's goal is an individual, per-month choice (the standard 30 h, or a reduced 15 h) that the app can't know, so the section just shows the hours and the standard 30 h reference and leaves interpretation to the overseer.

Filters (search, status, type, group) narrow the roster; on a phone the tables become stacked cards.

### Pioneer detail on the profile

Each pioneer's profile has an **Activity** section showing:

- A chart of monthly hours (bars) and cumulative hours (line), with the target rate as a reference line
- Hours to date, the annual goal, the **hours needed per month to finish**, and the recent 3-month average
- A projection at the recent pace, plus a *Goal unlikely to be reached at the current pace* warning when the required rate is far above the type's normal rate
- Their Bible-studies trend

Regular (non-pioneer) publishers keep a simpler activity section without the pace chart.

### How the goal and pace are computed

- The goal is a **monthly hour rate per pioneer type**, multiplied out over the service year. Built-in defaults: regular pioneer **50 h/month** (600/year), auxiliary **30 h/month**, special pioneer and missionary **100 h/month** (the last two are placeholders meant to be overridden).
- Proration is by **enrollment span**: a pioneer enrolled since September is measured against the full year; one who started mid-year gets a prorated goal. Missed months *inside* the span still count against the goal — only a genuinely late start reduces it.
- A **stop-and-restart gap** does not count against the goal: if a pioneer pauses (reverts to regular publisher) for a few months and then resumes, those in-between months are excluded from the enrollment span instead of being treated as a shortfall.

### Editing pioneer goals

Goals can be tuned per service year and per type in **Settings → Pioneer goals** (see [Settings](settings.md#pioneer-goals)). This needs the *Pioneer Goal Manager* permission. A type with no override falls back to the built-in default; past service years' goals can't be edited.

### Dashboard widget

Users with the *Activity Viewer* permission also see an **at-risk pioneers** card on their [dashboard](dashboard.md#at-risk-pioneers): the count of pioneers currently behind for the service year, linking straight to the roster.

## Reports and Exports

- **Individual PDF reports** — Activity report for a single publisher
- **Batch PDF export** — All publisher reports as a ZIP file
- **Yearly Excel export** — Full year activity summary for all publishers in a spreadsheet
- **Emergency rosters** — Whole-congregation or per-group PDF of [emergency-preparedness information](#emergency-preparedness-information)

## Login (optional)

A login is a separate sign-in account tied to a publisher's profile — distinct from the profile's [contact email](#profile-information). Adding a contact email does not create a login on its own; you add one explicitly. From the profile page, you can:

- **Add login** — Set the login email (prefilled from the contact email if one is present) and send the publisher a password-reset email. They'll be able to log in to the app afterwards.
- **Remove login** — Delete the login account but keep the profile. The publisher remains in all lists and reports; they just can't sign in anymore.

The two operations don't affect each other's data: you can swap an email or remove the login without losing attribution history, group membership, or activity reports.

## Permissions

| Permission | Can do |
|---|---|
| Publisher Viewer | View publisher profiles and group information |
| Publisher Manager | Create, edit, and deactivate publishers. Manage groups |
| Activity Viewer | View activity reports and statistics, the pioneers roster, and the dashboard at-risk widget |
| Activity Manager | Record, edit, and export publisher activity |
| Emergency Info Viewer | View any publisher's emergency information congregation-wide |
| Emergency Info Manager | Edit any publisher's emergency information congregation-wide |
| Pioneer Goal Manager | Set the monthly hour goals per pioneer type and service year |
| Admin | Everything |

A **group responsible or deputy** can always view and edit the emergency information of their own group's members without any of the permissions above — that access comes from their group responsibility.

See [Roles and Permissions](roles-and-permissions.md) for the full list of permissions across all features.

## Related

- [Territories](territories.md) — Territory attributions are linked to publishers
- [Feature Overview](feature-overview.md) — See all features at a glance
