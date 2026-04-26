# Virtual Display Board

The display board (*Tableau d'affichage*) is a digital notice board for sharing documents with congregation members. Think of it as the digital equivalent of the physical bulletin board in the Kingdom Hall.

## Board View

The main board page (`/board`) shows all visible documents organized by section. A page header displays the title and, for board validators, quick-access buttons to the section and document management pages.

### Highlighted Section

Documents marked as highlighted appear in a distinct **"À la une"** section at the top of the board. This section has a tinted primary background (`bg-primary/5`) with a megaphone icon and a count badge, making featured content immediately visible.

### Collapsible Sections

Each section can be **collapsed or expanded** by clicking its heading. Collapse state is persisted in the browser's localStorage, so sections stay collapsed across page reloads. Each section heading shows:

- **Document count** — An outline badge with the total number of documents
- **Unread count** — A blue info badge showing how many new/unread documents are in the section (only visible when > 0)

### Status Badges

Document cards display a **status badge** on the thumbnail area to communicate freshness. Only one badge is shown at a time, with this priority:

| Priority | Badge | Style | Condition |
|----------|-------|-------|-----------|
| 1 | "Mis à jour" | Blue (info) | PDF has been replaced (version > 0) and user already viewed a previous version |
| 2 | "Nouveau" | Solid teal (primary) | Document was created within the last 48 hours and user has not viewed it |
| 3 | "Non lu" | Outlined teal (primary border on secondary bg) | Document has not been viewed by the user |

### Document Cards

Each document appears as a card with:

- **Thumbnail** — PDF preview image (generated via background job) or a colored icon for dynamic documents
- **Title** — Semibold for unread documents, medium weight for read ones
- **Relative date** — "il y a 2 jours" for recent, absolute date for older documents
- **Preview text** — Dynamic documents show a short summary (e.g., "5 groupes", "3 pionniers", "Prochain : 28 avr.")

Dynamic document cards use **colored backgrounds per type**: blue for publisher groups, amber for pioneers, teal for programmes.

### Empty States

- **Regular users** see a generic message when no documents are visible
- **Board validators** see a guided setup prompt with a CTA button to create the first section. Empty sections are also shown (with a placeholder message) so validators can see the board structure

## Sections

Documents are organized into **sections** — named folders that group related documents together. For example, you might have sections for "Lettres de la filiale", "Programmes", or "Annonces".

- Create as many sections as needed
- Reorder sections to control how they appear on the board
- Each section shows a count of its documents

**Required role**: `BoardValidator` or `Admin`

## Documents

### Uploading

Upload PDF documents to any section on the board. Each document has:

- **Nom** — A display name for the document
- **Section** — Which section the document belongs to
- **Fichier à uploader** — The PDF file to upload

Documents are stored in the configured file storage backend (local filesystem or S3-compatible storage).

**Required role**: `BoardUploader`, `BoardValidator`, or `Admin`

### File Replacement

Existing documents can have their PDF file replaced from the edit page. The previous file is automatically saved as a version — see "Version History" below.

### Version History

When a document's file is replaced, the previous version is preserved. Access version history from the edit page (clock icon). Previous versions can be downloaded or restored. Restoring a version saves the current file as a new version first.

### Visibility Scheduling

Control when a document appears on the board:

- **Visible à partir du** — The date from which the document is visible
- **Visible jusqu'au** — The date after which the document is hidden

Documents outside their visibility window are not shown on the board. This lets you prepare documents in advance and schedule them to appear at the right time.

**Required role**: `BoardValidator` or `Admin`

### Highlighting

Important documents can be featured on the board using the *Mettre en avant le document sur le tableau d'affichage* option. Featured documents appear in the "À la une" section at the top of the board with a distinct visual container.

**Required role**: `BoardValidator` or `Admin`

## In-App PDF Viewer

Clicking a document opens an in-app viewer page that keeps the sidebar and navigation visible:

- **Desktop / iOS** — Uses the browser's native PDF embed with a clean toolbar-less view
- **Android** — Lazy-loads a PDF.js canvas renderer (~500 KB, loaded on demand) for inline viewing

The viewer includes a back button to the board and a download button. Document viewing is tracked server-side when the page loads.

## View Tracking

The system tracks which members have viewed each document. This gives administrators visibility into document reach without requiring explicit acknowledgment from members.

## Dynamic Documents

In addition to uploaded PDFs, the board can display **live data** from other Unitae features. Board validators add dynamic documents from a catalog via the "Ajouter un document dynamique" button.

Available types (appear only when the related feature has data):

- **Groupes de prédication** — Live list of publisher groups with responsible, deputy, and members
- **Pionniers** — List of publishers registered as regular pioneers, special pioneers, or missionaries
- **Programmes** — Configurable live schedule documents. Each programme document stores a `dynamicConfig` JSON with per-template parts/services selection and a groupBy preference (date or template). Multiple programme documents can be created with different configurations. The view shows events from the start of the current month with a clean layout: colored section bars, dot leaders between part names and assignees, and per-template content filtering. Legacy documents without `dynamicConfig` fall back to a single template via `dynamicRef` and a `showServices` flag.

Dynamic documents support the same visibility, highlighting, ordering, and section placement controls as PDF documents. They appear alongside PDFs in the same sections on the board. On the board view, each dynamic document card shows a **preview summary** (group count, pioneer count, or next event date) to provide context at a glance.

### Unread Detection

For PDFs, the unread badge disappears once a member opens the document. For dynamic documents, the badge **reappears when the underlying data changes** — e.g., when a new publisher is added to a group or a programme assignment is updated. This ensures members are notified of fresh content.

**Required role**: `BoardValidator` or `Admin` to add/configure. Any authenticated user can view.

## Permissions

| Role | Can do |
|------|--------|
| `BoardUploader` | Upload documents to the board |
| `BoardValidator` | Upload, edit, delete documents. Manage sections. Set visibility and highlighting. Quick-access buttons on the board view |
| `Admin` | Everything |
| Any authenticated user | View the board, its visible documents, and dynamic documents |

See [Roles and Permissions](roles-and-permissions.md) for the full list of roles across all features.

## Related

- [Feature Overview](feature-overview.md) — See all features at a glance
- [Dashboard](dashboard.md) — The homepage that links to unread board documents
- [Security](security.md) — How data isolation protects your documents
