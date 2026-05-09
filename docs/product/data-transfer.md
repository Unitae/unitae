# Data Transfer (Export & Import)

Unitae allows administrators to export and import entire congregation data as `.unitae` archive files. This is useful for migrating between instances, creating backups, or restoring data.

## Export

### How to export

1. Navigate to **Settings > Data > Export**
2. Choose export options:
   - **Include files** — Include uploaded documents (board PDFs, territory cards). Makes the archive larger.
   - **Include audit logs** — Include the full audit trail history.
3. Click **Export**
4. The export runs in the background. A progress page shows the current status.
5. When complete, download the `.unitae` archive file.

### What is exported

The archive contains all congregation data:

- Users (without passwords — recipients must reset their password after import)
- Territories, buildings, and building entrances with prospection data
- Territory attributions
- Publisher groups and activity records
- Events, event kinds, and programme templates with parts and service roles
- Programme assignments
- Board sections and documents (with optional uploaded files)
- Settings and notification preferences
- Consent records
- Audit logs (optional)

### Archive format

The `.unitae` file is a structured archive (a ZIP under the hood) bundling the congregation's data — and, when *Include files* is selected, the uploaded documents too. Contributors interested in the on-disk layout can read [Data Transfer Internals](../development/data-transfer.md).

## Import

### How to import

1. Navigate to **Settings > Data > Import**
2. Upload a `.unitae` archive file (max 500 MB)
3. The system validates the archive and detects conflicts:
   - **User email conflicts** — Users with matching email addresses
   - **Territory number conflicts** — Territories with matching numbers
   - **Event kind conflicts** — Event kinds with matching keys
4. Review the conflict summary, entity counts, and warnings
5. Click **Confirm import**
6. The import runs in the background. A progress page shows the current status.

### Conflict resolution

- **Users**: Skipped if the email already exists in a different congregation. Updated if in the same congregation.
- **Territories**: Updated with the imported data if the number matches.
- **Event kinds**: Skipped if a duplicate key exists.

### Important notes

- **Passwords are never imported.** All imported users must reset their password via email.
- **Internal identifiers are reissued.** When data is imported into a fresh congregation, every record gets a new internal identity and Unitae automatically re-stitches the relationships between them.
- The import is recorded in the audit trail.

## Permissions

Only users with the `Admin` role can access the data transfer features.

## Related

- [Security](security.md) — Data isolation and GDPR tools
- [Feature Overview](feature-overview.md) — See all features at a glance
