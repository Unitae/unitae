# Spec: Parallel rooms — one part, held in several rooms

**Status:** Draft — storage proposed for review; nothing built
**Feature area:** `events` (items, meetings, assignments), `settings` (schedule templates), `display-board`, `notifications`
**Related:** the event schedules spec (draft PR #533), canvas page `plannings`, row « Tour A — salles en parallèle »

> This is a proposal, not documentation of current behavior. Once built, the steady-state behavior
> should be folded into `docs/product/events.md` and `docs/product/settings.md`, and this file archived.

## 1. What the user decided (2026-11-25)

- A room is a **place**. A schedule template declares its rooms once: the main room, then any others
  (a Kingdom Hall may have up to four). Adding a room asks for its name only.
- **Parallel is a property of a part.** A part happens either for the whole congregation, or in
  several rooms at the same time. Nothing else changes in the part: same name, duration, part type
  and allowed roles.
- In **each room** the part has its own full set of assignees: the speaker, and the second speaker
  when its part type has that slot. A two-speaker part in three rooms needs six people.
- Rooms are declared **per template**. The **main room is always included** when a part is held in
  several rooms. A room unavailable one week is handled by **editing that meeting by hand**. Within a
  section, parts for everyone and parts held in several rooms **follow each other freely**.
- **Storage B:** one part, with the room carried by its assignments, rather than one copy of the
  part per room.

## 2. Today

- A room is a string (`track`) with a rank (`trackOrder`) on `TemplatePart`, `TemplateItem`,
  `EventPart` and `Item`. A part held in two rooms is two rows, one per room, each a full copy.
- Each copy carries what is per room today: `assigneeId` (speaker), `assistantId` (second speaker),
  `externalSpeakerId`, `topic` (a student's study point, set when assigning), `note`, `hasConflict`.
  It also repeats what is per part (`name`, `durationMin`, `presetId`, labels, allowed roles).
- Two readings of copies exist: the board groups copies sharing section and `order` into one part
  with a line per room (`groupPartsBySlot`); the meeting page and the template editor group by
  `track` into one list per room. The template editor (PRs #642–#645) gives copies different orders,
  so the board shows them as unlabelled separate rows. The demo and the reference fixtures hold no
  copies; production is believed to hold none (to confirm, read-only, with the user's go).

## 3. The model

### 3.1 Rooms

| Table | Columns | Notes |
|---|---|---|
| `ScheduleTemplateRoom` | `id`, `scheduleTemplateId`, `name`, `order`, `congregationId` | `order` 0 is the main room: created with every programme template, renamable, never deleted. Unique `[scheduleTemplateId, name]`. |
| `ScheduleRoom` | `id`, `scheduleId`, `name`, `order`, `congregationId` | A meeting's own rooms, copied from its template's when the schedule is created, then edited on that meeting only (decision 3). Same main-room rule. |

A room belongs to a programme schedule (template or meeting). Duties schedules have none.

### 3.2 A template part's rooms

`TemplatePartRoom(templatePartId, scheduleTemplateRoomId)` — the rooms a template part is held in.
No row means « toute l'assemblée » (the main room only, no parallel). Rows always include the main
room (decision 2), enforced by the writer. The template part keeps every other column; `track` and
`trackOrder` stop being written, then go (§5).

`TemplatePart` is what the app writes today (triggers mirror it to `TemplateItem`). The join table
attaches to `TemplatePart`; when 6a-1c-2 moves template items off kinds, it moves with them.

### 3.3 A meeting part's assignments, per room

`ItemRoom` — one row per room a meeting part is held in:

| Column | Meaning |
|---|---|
| `id`, `itemId`, `scheduleRoomId`, `congregationId` | which part, which room |
| `assigneeId`, `assistantId`, `externalSpeakerId` | the room's speaker, second speaker, outside speaker |
| `topic`, `note`, `hasConflict` | what is per student and per room today |

Unique `[itemId, scheduleRoomId]`. A part for everyone has **one** row, for the main room, so every
assignment lives in `ItemRoom` and readers have one shape to read. `Item` keeps what is per part:
`name`, `section`, `order`, `durationMin`, `presetId`, labels, allowed roles, schedule, event.

**Recommended:** every part has its rows, the main room included (B1). The alternative, keeping the
main room's assignees on `Item` and only extra rooms in `ItemRoom` (B2), breaks no reader on day one
but leaves two shapes to read forever: every notification, conflict check and export would have to
merge them. B1 is reached by the expand-and-contract path the schedules refactor used (§5).

### 3.4 What follows from it

- **Creating a meeting** copies the template's rooms into `ScheduleRoom`, then for each template
  part writes one `Item` and one `ItemRoom` per room it is held in.
- **Assigning** targets an `ItemRoom` and a slot (speaker or second speaker). Eligibility, absences
  and conflicts are checked per person, as today, and `hasConflict` is per room.
- **Notifications** name the room when the part is held in several: « Lecture de la Bible — Salle B ».
  `NotificationEvent` points at the `ItemRoom` (entity `ItemRoom`) instead of the copy.
- **Calendar feed** UIDs move from `programme-part-{slot}-{itemId}` to
  `programme-part-{slot}-{itemRoomId}`; the main room's row keeps the old UID during the move so a
  subscribed calendar does not see every event deleted and recreated.
- **Counts** (filled slots, open parts, publish previews) count slots per room: a part in three rooms
  with one speaker each has three slots.
- **Board and PDF** draw a part once, then a line per room, from `ItemRoom` instead of equal orders.
- **Reordering** moves a part, never a room: `Item.order` alone; the rooms follow.

## 4. Migrating today's copies

Copies are recognised by the original contract (same container, same `section`, same `order`,
non-empty `track`), widened to tolerate the editor's different orders: within a section, consecutive
runs of tracked parts with the same `name` are one part.

1. For each programme schedule template and each programme schedule, the distinct `track` values
   become rooms, in `trackOrder` order; the main room is the one of rank 1, else « Salle principale »
   is created at order 0.
2. Each group of copies becomes one part (the main room's copy is kept, the others' rows are merged
   into it); its rooms are the group's tracks.
3. On meetings, each copy's assignees, topic, note and conflict flag move to that room's `ItemRoom`.
   A part with no track gets one main-room row carrying its current assignees.
4. A notification pointing at a merged copy is repointed at the matching `ItemRoom`.

The migration is tested like the others (the shipped SQL, run in a rolled-back transaction, on
fixtures with copies sharing an order, copies with different orders, a lone tracked part and none).

## 5. Phases

Each phase is one or more PRs, deployed in order; the main app's code may run against a newer
schema for a while, so every step is backward-compatible.

1. **Expand.** The four tables; template rooms and « Où » in the template editor (the boards);
   meeting creation writes `ScheduleRoom` and `ItemRoom` beside today's columns (dual write: the
   main room's row mirrors `Item.assigneeId`/`assistantId`/…). Nothing reads them yet.
2. **Backfill.** The migration of §4, plus a catch-up for rows written before phase 1 deployed.
3. **Readers, one surface at a time:** meeting page and assignment dialog; conflicts and absences;
   notifications, calendar feed, « mes attributions », dashboard; board and PDF; programme list and
   counts; cadence and history.
4. **Writers to `ItemRoom` only;** export/import (archive version bump, older archives translated);
   the control plane's GDPR export and congregation deletion (same deploy PR as the pin).
5. **Contract.** `track`, `trackOrder` and the per-room columns on `Item` and `EventPart` go, with
   the triggers that mirror them. Reference files that print those keys change here (user approval).

## 6. Open questions

1. **Per room or per part:** `topic` and `note` per room (proposed: a student's study point differs
   per room), `durationMin` per part (proposed: the same part, the same time). Agreed?
2. **The main room's name:** « Salle principale » by default, renamable. Agreed?
3. **Production check:** may I run a read-only count of tracked parts in production before writing
   the migration, so its rules are tested on what exists?
4. **Phase 1 order:** build the template side first (rooms, « Où », the boards) while meetings keep
   writing today's copies until phase 3? It ships something visible sooner, but meetings created in
   between would then need the backfill too.
