# Spec: Event documents — printed sheets built from events

**Status:** Draft — direction agreed with the author; design level. Depends on the target model of
[event schedules](./event-schedules.md) (multi-day events, group assignees, custom fields, repetition
rules).
**Author:** Nathanaël Cherrier
**Feature area:** `features/display-board` (dynamic documents) reading `features/events` through its
barrels
**Related:** [Event schedules](./event-schedules.md), [Meeting Attendance](../meeting-attendance.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state behavior
> should be folded into the relevant `docs/` pages and this file archived.

## 1. Problem

Besides the meeting programme, a congregation prints and posts other sheets, today made by hand in a
spreadsheet or a word processor and re-made at every change:

| Sheet | Shape |
|---|---|
| Cleaning by group | rows = weeks; a group per week (and per hall, when two congregations share it); an instructions block |
| Public witnessing points | rows = weekends; columns = groups; cells = the point each group takes |
| Field service meetings | a week grid (weekday × morning/noon/afternoon/evening): time, place, format, conductors; a legend and the videoconference access details |
| Theocratic events | a list by kind: circuit assembly, convention, pioneer meeting, visit week, special talk, Mémorial dates for several years |
| Shared-building events | a list of cards: concerns, date(s), event, room, effect on the meetings |

With the event schedules model, every one of these is **events and their schedules**. What is
missing is how they are **rendered**: the board only knows the programme, publisher groups, pioneers
and the organigram.

## 2. Goals / Non-goals

**Goals**

- Three new curated layouts of board documents, each fed by one or more **event kinds**, on screen and
  on paper with the quality of the existing documents.
- An optional fixed **text block** on each (instructions, legend, access details).
- Custom fields marked « affiché sur les documents » (event schedules D15) appear, on screen and on
  print — people without an account rely on the printed sheet.

**Non-goals**

- Free-form layouts or per-document content switches: layouts are curated, configuration is the data
  source (as for the programme document today).
- Another congregation's schedule in the same sheet (the second hall column) — data across
  congregations.
- Rotation (filling assignments) — a separate feature.

## 3. Current implementation (verified)

- `DynamicType` = `publisher-groups`, `pioneers`, `programme`, `organigram`
  (`display-board/model/dynamic-document.type.ts`).
- The programme document's configuration is a list of templates with `parts` / `services` switches
  and `groupBy: 'date' | 'template'` (`display-board/schemas/dynamic-config.schema.ts`).
- Each type has a screen view (`ui/dynamic/*View.tsx`) and a react-pdf document
  (`ui/dynamic/pdf/*Document.tsx`) sharing a layout, with render-gate tests per type; the reading layer
  (`board-reading.tsx`) handles search, the reader's own name and links.

## 4. Layouts

All three take a list of **event kinds** as their source, show published schedules only, and carry
the masthead « À jour au … » like the other board documents.

### 4.1 Liste d’évènements (`events-list`)

- Events of the chosen kinds from today on (and the coming Mémorial dates already created),
  **grouped by kind, sorted by date**.
- Each entry: date or date range, time, title, the displayed custom fields (« Lieu », « Salle »,
  « Concerne », « Modifications »).
- Covers « Évènements théocratiques » and « Informations communes ».

### 4.2 Tableau (`table`)

- One kind (« Semaine de nettoyage », « Témoignage public »); **rows = its events** by date, labelled
  by day or by week (« 9 – 15 nov. »).
- **Columns = the duties of one schedule** (the points: Confluence, Debourg…) with the assignee in each
  cell — or, inverted, **columns = groups** with the duty each takes (the TPL sheet's layout). The
  inversion is the one layout choice.
- A cell may carry a marker from a choice field (the « nettoyage hebdomadaire » colour).
- The current week is highlighted on screen; paper prints the whole range.

### 4.3 Semaine type (`week`)

- One kind with several repetition rules (« Réunion pour la prédication »): a grid **weekday × part of
  day** (matin, midi, après-midi, soir), each rule in its cell with time, displayed fields and the
  duty assignees (conductors).
- Built from the **rules in force today**, not from dated events — the sheet describes an ordinary
  week. A cell with only a label (« Prédication par groupe ») is a rule with its own name and no
  place or conductor (event schedules D34): the cell prints the name.
- **Changes to come** (event schedules D20): a rule starting within the document's horizon appears in
  its cell under the current one, marked « à partir du 1er déc. »; one that ends is marked
  « jusqu’au 30 nov. ».
- **One-time changes** (D21) within the horizon are listed under the grid: « Mer. 25 nov. : 9:30 à la
  Salle du Royaume au lieu de chez un proclamateur », « Jeu. 24 déc. : pas de réunion ». A deleted
  occurrence of a rule is listed as « pas de réunion ». A prepared meeting left on its old day when the
  rule changed (event schedules D22) is a one-time change like any other.
- The format field's legend sits in the text block.

### 4.4 Text block

A long text written once on the document (instructions, legend, videoconference access), printed under
the layout. Plain paragraphs and lists, no formatting beyond that.

## 5. Configuration

| Layout | Configuration |
|---|---|
| Liste d’évènements | kinds; how far ahead (3, 6, 12 months, or « all created ») |
| Tableau | kind; schedule; orientation (columns = duties or groups); row label (the week « 9 – 15 nov. » or the first day « 7 nov. »); range (current service year, next N weeks) |
| Semaine type | kind; parts of day shown; horizon for changes to come (4 or 8 weeks) |
| All | text block; appearance as for the other documents |

## 6. Phasing

| PR | Content |
|---|---|
| 1 | Liste d’évènements (screen + PDF) |
| 2 | Tableau |
| 3 | Semaine type |

After event schedules' custom fields, rules and group assignees have landed (plan PR 7); see
[event-schedules-plan.md](./event-schedules-plan.md) §17.

## 7. Open questions

None. Decided: the Tableau's row label is a document option (§5); « Semaine type » shows changes to
come and one-time changes (§4.3).
