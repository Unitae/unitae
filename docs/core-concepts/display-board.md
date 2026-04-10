# Virtual Display Board

The display board (*Tableau d'affichage*) is a digital notice board for sharing documents with congregation members. Think of it as the digital equivalent of the physical bulletin board in the Kingdom Hall.

## Sections

Documents are organized into **sections** — named folders that group related documents together. For example, you might have sections for "Lettres de la filiale", "Programmes", or "Annonces".

- Create as many sections as needed
- Reorder sections to control how they appear on the board
- Each section shows a count of its documents

**Required role**: `BoardValidator` or `Admin`

## Documents

### Uploading

Upload PDF documents to any section on the board. Each document has:

- **Title** — A display name for the document
- **Section** — Which section the document belongs to
- **PDF file** — The actual document file

Documents are stored in the configured file storage backend (local filesystem or S3-compatible storage).

**Required role**: `BoardUploader`, `BoardValidator`, or `Admin`

### Visibility Scheduling

Control when a document appears on the board:

- **visibleFrom** — The date from which the document is visible
- **visibleUntil** — The date after which the document is hidden

Documents outside their visibility window are not shown on the board. This lets you prepare documents in advance and schedule them to appear at the right time.

**Required role**: `BoardValidator` or `Admin`

### Highlighting

Important documents can be **highlighted** to pin them to the top of the board, making them immediately visible to all members.

**Required role**: `BoardValidator` or `Admin`

## View Tracking

The system tracks which members have viewed each document. This gives administrators visibility into document reach without requiring explicit acknowledgment from members.

## Permissions

| Role | Can do |
|------|--------|
| `BoardUploader` | Upload documents to the board |
| `BoardValidator` | Upload, edit, delete documents. Manage sections. Set visibility and highlighting |
| `Admin` | Everything |

Any authenticated user can view the board and its visible documents.
