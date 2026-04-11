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

- **Nom** — A display name for the document
- **Section** — Which section the document belongs to
- **Fichier à uploader** — The PDF file to upload

Documents are stored in the configured file storage backend (local filesystem or S3-compatible storage).

**Required role**: `BoardUploader`, `BoardValidator`, or `Admin`

### Visibility Scheduling

Control when a document appears on the board:

- **Visible à partir du** — The date from which the document is visible
- **Visible jusqu'au** — The date after which the document is hidden

Documents outside their visibility window are not shown on the board. This lets you prepare documents in advance and schedule them to appear at the right time.

**Required role**: `BoardValidator` or `Admin`

### Highlighting

Important documents can be featured on the board using the *Mettre en avant le document sur le tableau d'affichage* option. Featured documents are pinned to the top, making them immediately visible to all members.

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

See [Roles and Permissions](roles-and-permissions.md) for the full list of roles across all features.

## Related

- [Feature Overview](feature-overview.md) — See all features at a glance
- [Security](security.md) — How data isolation protects your documents
