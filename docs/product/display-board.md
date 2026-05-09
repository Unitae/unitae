# Virtual Display Board

The display board is a digital notice board for sharing documents with congregation members. Think of it as the digital equivalent of the physical bulletin board in the Kingdom Hall.

## Who can see the board

Opening the board requires the **Board Viewer** permission. Members without it cannot reach the board, its documents, or the in-app PDF viewer. By default the built-in Publisher role does not include Board Viewer — an admin attaches it to whichever roles should see the board (typically Publisher, or a more restricted role like Elder).

## Board View

The main board page shows all visible documents organized by section. A page header displays the title and quick-access buttons to the management pages: validators see both the *Manage sections* and *Manage documents* buttons; uploaders see only the *Manage documents* button (their entry point to the upload form).

### Highlighted Section

Documents marked as highlighted appear in a distinct **"Featured"** section at the top of the board. This section has a tinted background with a megaphone icon and a count badge, making featured content immediately visible.

### Collapsible Sections

Each section can be **collapsed or expanded** by clicking its heading. Collapse state is persisted in the browser's localStorage, so sections stay collapsed across page reloads. Each section heading shows:

- **Document count** — An outline badge with the total number of documents
- **Unread count** — A blue info badge showing how many new/unread documents are in the section (only visible when > 0)

### Status Badges

Document cards display a **status badge** on the thumbnail area to communicate freshness. Only one badge is shown at a time, with this priority:

| Priority | Badge | Style | Condition |
|----------|-------|-------|-----------|
| 1 | "Updated" | Blue (info) | PDF has been replaced and the user already viewed a previous version |
| 2 | "New" | Solid teal | Document was created within the last 48 hours and the user has not viewed it |
| 3 | "Unread" | Outlined teal | Document has not been viewed by the user |

### Document Cards

Each document appears as a card with:

- **Thumbnail** — PDF preview image (generated via background job) or a colored icon for dynamic documents
- **Title** — Semibold for unread documents, medium weight for read ones
- **Relative date** — "2 days ago" for recent items, absolute date for older ones
- **Preview text** — Dynamic documents show a short summary (e.g., "5 groups", "3 pioneers", "Next: Apr 28")

Dynamic document cards use **colored backgrounds per type**: blue for publisher groups, amber for pioneers, teal for programmes.

### Empty States

- **Regular users** see a generic message when no documents are visible
- **Board validators** see a guided setup prompt with a CTA button to create the first section. Empty sections are also shown (with a placeholder message) so validators can see the board structure

## Sections

Documents are organized into **sections** — named folders that group related documents together. For example, you might have sections for "Branch letters", "Programmes", or "Announcements".

- Create as many sections as needed
- Reorder sections to control how they appear on the board
- Each section shows a count of its documents
- Restrict each section to a chosen list of roles when needed (see "Section visibility" below)

**Required permission**: Board Validator or Admin

### Section visibility

Each section can be restricted to specific roles. From the section's edit page, pick the roles allowed to see it — for example, "Elders" or a custom "Service committee" role you've created. Members who don't hold any of those roles see neither the section nor its documents on the board.

By default a section has no role restrictions and is visible to anyone with the Board Viewer permission.

This works with both built-in roles (Elder, Anointed, Publisher, …) and custom roles you've defined in Settings.

## Documents

### Uploading

Upload PDF documents to any section on the board. Each document has:

- **Name** — A display name for the document
- **Section** — Which section the document belongs to
- **File to upload** — The PDF file (must be a real PDF, up to 20 MB)

Larger files are rejected at upload with a clear error message — split or re-export the PDF and try again.

**Required permission**: Board Uploader, Board Validator, or Admin

### File Replacement

Existing documents can have their PDF file replaced from the edit page. The previous file is preserved as a version — see "Version History" below.

### Version History

Every upload is recorded with the date and the person who uploaded it — the original upload as well as later replacements. Open the history from the edit page (clock icon) to download or restore any previous version. Restoring brings back the chosen file as the current one and adds a new entry to the history.

The system uses the original uploader's identity to decide who can later edit or delete a document — see Permissions below.

### Visibility Scheduling

Control when a document appears on the board:

- **Visible from** — The date from which the document is visible
- **Visible until** — The date after which the document is hidden

Documents outside their visibility window are not shown on the board. This lets you prepare documents in advance and schedule them to appear at the right time.

**Required permission**: Board Validator or Admin

### Highlighting

Important documents can be featured on the board using the *Feature this document on the board* option. Featured documents appear in the "Featured" section at the top of the board with a distinct visual container.

**Required permission**: Board Validator or Admin

## In-App PDF Viewer

Clicking a document opens an in-app viewer page that keeps the sidebar and navigation visible:

- **Desktop / iOS** — Uses the browser's native PDF embed with a clean toolbar-less view
- **Android** — Falls back to an in-app renderer that loads on demand to keep the page lightweight

The viewer includes a back button to the board and a download button. Document viewing is tracked server-side when the page loads.

## View Tracking

The system tracks which members have viewed each document. This gives administrators visibility into document reach without requiring explicit acknowledgment from members.

## Dynamic Documents

In addition to uploaded PDFs, the board can display **live data** from other Unitae features. Board validators add dynamic documents from a catalog via the "Add a dynamic document" button.

Available types (appear only when the related feature has data):

- **Field service groups** — Live list of publisher groups with responsible, deputy, and members
- **Pioneers** — List of publishers registered as regular pioneers, special pioneers, or missionaries
- **Programmes** — Configurable live schedule documents. Each programme document selects which template parts and service roles to show, and how to group them (by date or by template). Multiple programme documents can be created with different configurations. The view shows events from the start of the current month with a clean layout: colored section bars, dot leaders between part names and assignees, and per-template content filtering.

Dynamic documents support the same visibility, highlighting, ordering, and section placement controls as PDF documents. They appear alongside PDFs in the same sections on the board. On the board view, each dynamic document card shows a **preview summary** (group count, pioneer count, or next event date) to provide context at a glance.

### Unread Detection

For PDFs, the unread badge disappears once a member opens the document. For dynamic documents, the badge **reappears when the underlying data changes** — e.g., when a new publisher is added to a group or a programme assignment is updated. This ensures members are notified of fresh content.

**Required permission**: Board Validator or Admin to add/configure. Members with Board Viewer can read them.

## Permissions summary

| Permission | What it grants on the board |
|---|---|
| Board Viewer | Open the board, read documents (filtered by section visibility) |
| Board Uploader | Everything Viewer grants, plus: upload new documents, and on documents they uploaded — edit title/section/file, delete, view and restore versions. **Cannot** set the visibility window or highlight a document |
| Board Validator | Everything Uploader grants, plus: edit/delete any document, manage sections and their visibility, set the visibility window, highlight, and add/configure dynamic documents |
| Admin | Everything |

Whether an uploader counts as the "owner" of a document depends on whether the system has recorded them as the original uploader. Documents that pre-date this tracking have no recorded uploader and can only be edited by validators.

See [Roles and Permissions](roles-and-permissions.md) for the full list of permissions across all features.

## Related

- [Feature Overview](feature-overview.md) — See all features at a glance
- [Dashboard](dashboard.md) — The homepage that links to unread board documents
- [Security](security.md) — How data isolation protects your documents
