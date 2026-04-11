# GDPR Compliance Checklist — Unitae

This document tracks all technical and legal items required for GDPR compliance. It covers both the open-source application (self-hosted) and MindsersIT's obligations as data processor for the managed SaaS at `unitae.app`.

**Key context**: Unitae manages Jehovah's Witnesses congregation data. Under GDPR, this constitutes **special category data** (Article 9 — religious beliefs). The CJEU ruling C-25/17 (2018) specifically addressed JW data collection, confirming congregations are **data controllers**. This triggers heightened requirements throughout.

---

## Table of Contents

1. [Legal Documents](#1-legal-documents)
2. [Data Subject Rights (Technical)](#2-data-subject-rights-technical)
3. [Consent Management](#3-consent-management)
4. [Security & Privacy by Design](#4-security--privacy-by-design)
5. [Data Processor Obligations (MindsersIT)](#5-data-processor-obligations-mindsersit)
6. [Data Mapping](#6-data-mapping)
7. [Data Retention](#7-data-retention)
8. [Sub-Processors](#8-sub-processors)
9. [Ongoing Compliance](#9-ongoing-compliance)

---

## 1. Legal Documents

### Required before launch (SaaS)

- [x] **Privacy Policy** (French) — public page at `/privacy`
  - Identity and contact details of the controller (each congregation) and processor (MindsersIT)
  - Privacy contact email
  - Purposes and legal basis for each processing activity
  - Categories of personal data processed
  - Recipients / sub-processors
  - International transfers and safeguards
  - Retention periods per data category
  - Data subject rights and how to exercise them
  - Right to lodge complaint with CNIL
  - Special category data disclosure (religious affiliation)

- [ ] **Data Processing Agreement (DPA)** — contract between MindsersIT and each congregation
  - Subject matter, duration, nature, and purpose of processing
  - Types of personal data and categories of data subjects
  - Processor obligations (process only on instructions, staff confidentiality, security measures)
  - Assistance with data subject rights requests
  - Data return/deletion at contract end
  - Sub-processor provisions (prior authorization, flow-down obligations)
  - Breach notification obligations
  - Audit rights
  - Specific provisions for special category data (Article 9)

- [ ] **Data Protection Impact Assessment (DPIA)** — mandatory for religious data at scale
  - Description of processing operations and purposes
  - Assessment of necessity and proportionality
  - Assessment of risks to data subjects' rights and freedoms
  - Measures to mitigate risks (encryption, access controls, audit logging, tenant isolation)
  - Consultation with CNIL if high residual risk remains

- [ ] **Records of Processing Activities (RoPA)** — Article 30
  - List of all processing activities
  - Purposes for each activity
  - Categories of data subjects and personal data
  - Categories of recipients
  - International transfers
  - Retention periods
  - Description of security measures

- [ ] **Sub-processor list** — public page listing all sub-processors (see Section 8)

- [ ] **Data retention policy** — documented retention periods per data category (see Section 7)

- [ ] **Breach response procedure** — internal document
  - Detection and assessment process
  - 72-hour notification to CNIL (Article 33)
  - Notification to affected congregations and data subjects (Article 34)
  - Template notifications
  - Post-incident review process
  - Note: lower threshold for religious data — most breaches require data subject notification

### Recommended (self-hosted documentation)

- [ ] **Self-hosting GDPR guide** — documentation explaining that self-hosters are sole controllers and must ensure their own compliance
- [ ] **Built-in GDPR features guide** — how to use export, anonymization, consent tools

---

## 2. Data Subject Rights (Technical)

### Right of Access / Data Portability (Articles 15 + 20)

- [x] **User data export service** — `exportUserData(userId, congregationId)`
  - Export all personal data as JSON (route: `/settings/users/:userId/export-data`)
  - Covers: user profile, roles, activities, attributions, groups, events, board docs, consents
  - Accessible to: the user themselves + Admin/SettingsUserManager role
  - Instant JSON download, machine-readable format

### Right to Erasure (Article 17)

- [x] **User anonymization service** — `anonymizeUser(userId)`
  - Anonymize (not hard delete) to preserve FK integrity
  - Admin-only trigger (route: `/settings/users/:userId/anonymize`)
  - Replace: firstname, lastname, email, phone, address, birthDate, baptismDate, password
  - Reset: isMale, isHelder, isServant, isAnointed to false
  - Set `anonymizedAt` timestamp
  - Deletes roles and password reset tokens
  - Preserve PublisherActivity and Attribution records (now reference anonymous user)
  - Creates DataDeletionRecord for backup reconciliation
  - Session revocation via `!user.active` check in `verifySession()`
  - Confirmation dialog on user edit page (Admin only, AlertDialog)
  - **Not yet done**: delete S3/local files uploaded by user (no user-owned files in current schema)

- [x] **Deletion ledger** — `DataDeletionRecord` model
  - Track all anonymization/deletion operations
  - Fields: entityType, entityId, congregationId, requestedAt, completedAt, requestedBy
  - Used to re-apply anonymization if a backup is restored
  - RLS policy enabled

### Right to Rectification (Article 16)

- [x] **User profile editing** — already exists (admin can edit publisher profiles)
- [ ] **Verify corrections propagate** — ensure no stale data in Redis caches after profile edits

### Right to Restriction (Article 18) — Priority 2

- [ ] **Data processing freeze** — ability to "freeze" a user's data (stored but not processed)
  - Add `restrictedAt DateTime?` to User model
  - Exclude restricted users from reports, stats, exports

### Right to Object (Article 21) — Priority 2

- [ ] **Processing objection workflow** — admin interface to handle objections
  - May lead to anonymization or restriction depending on the case

---

## 3. Consent Management

### Consent Tracking

- [x] **ConsentRecord database model**
  - Fields: userId, purpose, consentedAt, withdrawnAt, consentVersion, ipAddress, congregationId
  - Purposes: DATA_PROCESSING, EMAIL_NOTIFICATIONS
  - RLS policy enabled
  - Retain records minimum 2 years after withdrawal

- [x] **Consent at registration** — record consent during congregation registration and user setup
- [x] **Consent management UI** — user settings page at `/me/consents` to view and withdraw consent
- [ ] **Consent version tracking** — link consent records to specific policy versions

### Cookie Consent

- [x] **Session cookies** — strictly necessary, no consent needed (already httpOnly/secure)
- [x] **Google Maps cookie consent** — load maps only after explicit user consent
  - Consent banner on BuildingEntranceMap component
  - No Google Maps scripts loaded before consent
  - Preference stored in localStorage per browser
- [ ] **Future analytics** — if analytics are added, require consent first

---

## 4. Security & Privacy by Design

### Already implemented

- [x] **Tenant isolation** — PostgreSQL Row-Level Security on all scoped models
- [x] **Role-based access control** — 14 congregation-scoped roles via CongregationUserRole
- [x] **Password hashing** — bcrypt
- [x] **Session security** — httpOnly, secure, sameSite=lax, 1h expiry in production
- [x] **Rate limiting** — 5 login attempts / 15 min per email via Redis
- [x] **TLS in transit** — cert-manager TLS on Kubernetes ingress
- [x] **No tracking cookies** — no analytics or marketing cookies by default
- [x] **File storage isolation** — S3 keys include `{congregationId}/{feature}/`

### Still needed

- [ ] **Audit logging** — structured log of data access and modifications (Priority 2)
  - Events: profile views, edits, exports, anonymizations, role changes, login/logout
  - Separate from application logs
  - Immutable/append-only storage
  - Retain 1–2 years

- [ ] **Log PII redaction** — strip/hash personal data from Winston application logs (Priority 2)
  - Currently logs include email addresses, userIds in error context
  - Replace with hashed identifiers

- [ ] **Database encryption at rest** — verify PostgreSQL encryption configuration on OVH

- [ ] **Backup encryption** — verify S3 backup encryption settings

- [ ] **Platform admin access logging** — log all platform admin data access (Priority 2)

---

## 5. Data Processor Obligations (MindsersIT)

These apply only to the managed SaaS at `unitae.app`:

- [ ] **DPA signed with each congregation** before they start using the service
- [ ] **Process only on documented instructions** — no data usage beyond what the DPA specifies
- [ ] **Staff confidentiality** — ensure all MindsersIT personnel with access are under confidentiality obligations
- [ ] **Sub-processor management** — maintain public list, notify congregations before adding new ones
- [ ] **Breach notification to congregations** — within timeframe specified in DPA
- [ ] **Assist with data subject requests** — provide tools (export, anonymization) and support
- [ ] **Data return/deletion at contract end** — export congregation data and delete from platform
- [ ] **Audit support** — make information available to demonstrate compliance
- [ ] **DPO or privacy contact** — designate a privacy contact for data protection inquiries
- [ ] **DSAR management interface** — admin tooling to track and fulfill data subject requests (Priority 2)
  - Status tracking: received → processing → completed
  - Response deadline tracking (1 month)

---

## 6. Data Mapping

### Personal Data Inventory

#### User Model — Direct personal data

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `firstname` | String? | Identify member within congregation | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `lastname` | String? | Identify member within congregation | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `email` | String | Authentication, communication | Art. 6(1)(b) Contract | Yes (religious) |
| `password` | String | Authentication (bcrypt hash) | Art. 6(1)(b) Contract | No (hashed) |
| `phone` | String? | Contact information | Art. 6(1)(b) Contract | Yes (religious) |
| `address` | String? | Contact information | Art. 6(1)(b) Contract | Yes (religious) |
| `isMale` | Boolean? | Gender for congregation roles | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `birthDate` | DateTime? | Age verification, milestones | Art. 6(1)(b) Contract | Yes (religious) |
| `baptismDate` | DateTime? | Religious milestone | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `isHelder` | Boolean | Religious role assignment | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `isServant` | Boolean | Religious role assignment | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `isAnointed` | Boolean | Religious status | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `isPublisher` | Boolean | Religious status | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `type` | String | Publisher category | Art. 6(1)(b) Contract + Art. 9(2)(d) | Yes (religious) |
| `active` | Boolean | Account status | Art. 6(1)(b) Contract | No |
| `platformAdmin` | Boolean | Platform role | Art. 6(1)(f) Legitimate interest | No |
| `congregationId` | Int | Tenant isolation | Art. 6(1)(b) Contract | Yes (religious) |

#### PublisherActivity — Religious practice data

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `month`, `year` | Int | Activity period | Art. 6(1)(b) + Art. 9(2)(d) | Yes |
| `hours` | Int? | Field service hours | Art. 6(1)(b) + Art. 9(2)(d) | Yes (religious practice) |
| `studies` | Int | Bible studies conducted | Art. 6(1)(b) + Art. 9(2)(d) | Yes (religious practice) |
| `type` | String | Publisher type for the month | Art. 6(1)(b) + Art. 9(2)(d) | Yes |
| `isPublisher` | Boolean | Was active publisher that month | Art. 6(1)(b) + Art. 9(2)(d) | Yes |
| `notes` | String | Free-text notes | Art. 6(1)(b) + Art. 9(2)(d) | Potentially |
| `publisherId` | Int | Links to User | Art. 6(1)(b) + Art. 9(2)(d) | Yes |

#### Attribution — Territory assignments

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `publisherId` | Int | Assigned publisher | Art. 6(1)(b) + Art. 9(2)(d) | Yes |
| `territoryId` | Int | Assigned territory | Art. 6(1)(b) | No |
| `startDate`, `endDate` | DateTime | Assignment period | Art. 6(1)(b) | No |
| `lateDate` | DateTime | Return deadline | Art. 6(1)(b) | No |
| `notes` | String | Assignment notes | Art. 6(1)(b) | Potentially |

#### PublisherGroup — Group membership

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `name` | String | Group name | Art. 6(1)(b) | No |
| `adress` | String | Meeting location | Art. 6(1)(b) | No |
| `responsibleId` | Int | Group leader (User FK) | Art. 6(1)(b) + Art. 9(2)(d) | Yes |
| `deputyId` | Int? | Deputy leader (User FK) | Art. 6(1)(b) + Art. 9(2)(d) | Yes |

#### CongregationUserRole — Role assignments

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `userId` | Int | User assigned the role | Art. 6(1)(b) | Yes (religious) |
| `roleId` | Int | Role reference | Art. 6(1)(b) | No |

#### BoardDocument — Document tracking

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `viewedBy` | User[] | Tracks who viewed the document | Art. 6(1)(f) Legitimate interest | No |

#### Event — Event creation tracking

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `createdById` | Int | Event creator (User FK) | Art. 6(1)(b) | No |

#### PasswordResetToken — Authentication

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `token` | String | Password reset | Art. 6(1)(b) Contract | No |
| `userId` | Int | Token owner | Art. 6(1)(b) Contract | No |
| `expiresAt` | DateTime | Token expiry (24h) | Art. 6(1)(b) Contract | No |

#### Building — Prospection data (indirect personal data risk)

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `number`, `street`, `zip` | String | Building address | Art. 6(1)(b) | No (not PII) |
| `latitude`, `longitude` | Float? | Map coordinates | Art. 6(1)(b) | No |
| `notes`, `importantNotes` | String | Prospection notes | Art. 6(1)(b) | Potentially (if names mentioned) |
| `prospectionDate` | DateTime? | Last visit date | Art. 6(1)(b) | No |

#### Congregation — Organization data

| Field | Data Type | Purpose | Legal Basis | Special Category |
|---|---|---|---|---|
| `name`, `slug`, `domain` | String | Tenant identification | Art. 6(1)(b) | Yes (identifies religious org) |
| `displayName` | String? | Custom branding | Art. 6(1)(b) | No |
| `emailFromName`, `emailFromAddress` | String? | Email sender config | Art. 6(1)(b) | No |
| `stripeCustomerId`, `stripeSubscriptionId` | String? | Billing (SaaS only) | Art. 6(1)(b) | No |

### Data Flows

| Flow | Source | Processing | Recipients | Notes |
|---|---|---|---|---|
| User registration | User input | Stored in PostgreSQL | None | Password hashed with bcrypt |
| Publisher activity | Admin input | Stored in PostgreSQL | Excel/PDF exports (downloaded by admin) | Monthly field service reports |
| Territory attribution | Admin input | Stored in PostgreSQL | S13 export (downloaded by admin) | Assignment tracking |
| Password reset | User input | Token stored, email sent | Resend (email delivery) | Email contains reset link, no PII in body |
| Board notifications | System event | Email generated | Resend (email delivery) | Sends to validators with firstname + email |
| Data sync | Admin trigger | External API call | Google Maps API | Building coordinates sent |
| File uploads | Admin input | Stored in S3 / local | S3 provider (if configured) | Board documents (PDFs) |
| Session auth | User login | Cookie stored | None | Only userId in cookie, httpOnly |
| Rate limiting | Login attempt | Redis key stored | None | Email-based keys, 15min TTL |
| BullMQ jobs | Admin trigger | Redis queue | None | Contains userEmail, congregationId |

---

## 7. Data Retention

| Data Category | Retention Period | Justification | Cleanup Method |
|---|---|---|---|
| Active user accounts | Duration of membership + 30 days | Contract performance | Admin anonymization |
| Publisher activity reports | Duration of membership + configurable | Congregation admin needs | Anonymized with user |
| Territory attributions | Duration of congregation account | Operational necessity | Anonymized with user |
| Board documents | Until removed by admin + 30 days | Purpose fulfilled | Admin deletion |
| Session cookies | 1 hour (production) | Security | Automatic expiry |
| Password reset tokens | 24 hours | Security | Need cleanup job |
| Login rate limit keys | 15 minutes | Security | Automatic Redis TTL |
| BullMQ job records | 5 completed / 10 failed | Operational | Automatic BullMQ config |
| Audit logs | 2 years | Legitimate interest (security) | Automated purge (to build) |
| Consent records | 2 years after withdrawal | Accountability | Automated purge (to build) |
| Anonymized user records | Indefinite | No longer personal data | N/A |
| Deletion ledger | Indefinite | Backup reconciliation | N/A |
| Billing data (Stripe) | 10 years | French tax law (legal obligation) | Manual |

### Retention automation needed

- [ ] **Scheduled job to clean expired PasswordResetTokens** — currently no cleanup
- [ ] **Scheduled job to purge old audit logs** — after 2 years (once audit logging is built)
- [ ] **Scheduled job to purge old consent records** — 2 years after withdrawal
- [ ] **Admin notification for inactive users** — flag users past retention threshold

---

## 8. Sub-Processors

All sub-processors must be documented and congregations notified before adding new ones.

| Sub-processor | Purpose | Personal Data Shared | Location | Transfer Mechanism |
|---|---|---|---|---|
| OVH | Cloud hosting (Kubernetes) | All data (at rest and in transit) | EU (France) | N/A (intra-EU) |
| Resend | Transactional email delivery | Email address, firstname, lastname | US | EU-US Data Privacy Framework (verify) |
| Stripe | Payment processing | Billing info (via control plane) | US | EU-US DPF (certified) |
| S3-compatible provider | File storage (board documents) | Uploaded documents | Configurable | Depends on provider |
| Google Maps Platform | Map display, geocoding | Building coordinates (lat/lng) | US | EU-US DPF (certified) |

### Actions needed

- [ ] **Verify Resend's DPF certification** and obtain their DPA
- [ ] **Verify S3 provider's GDPR compliance** (depends on deployment)
- [ ] **Obtain DPAs from all sub-processors** (OVH, Resend, Stripe, S3 provider)
- [ ] **Publish sub-processor list** on unitae.app
- [ ] **Set up notification process** for sub-processor changes

---

## 9. Ongoing Compliance

- [ ] **Annual DPIA review** — reassess when processing changes
- [ ] **Sub-processor list maintenance** — update when vendors change
- [ ] **DPA updates** — when sub-processors or processing activities change
- [ ] **Privacy policy updates** — when processing or retention changes
- [ ] **Security assessments** — regular review of access controls and encryption
- [ ] **Staff training** — data protection awareness for anyone with data access
- [ ] **Incident response drills** — test breach notification procedures
- [ ] **Consent re-collection** — when privacy policy materially changes
- [ ] **Backup retention review** — verify rolling deletion cycle (suggested: 30 days)
- [ ] **Cross-tenant isolation testing** — regular verification that tenant scoping prevents data leakage

---

## Implementation Priority

### Priority 1 — Must have before SaaS launch
1. ~~Privacy Policy page (`/privacy`)~~ — done
2. ~~User data export (JSON)~~ — done
3. ~~User anonymization (admin-only)~~ — done (session revocation, confirmation dialog, deletion ledger)
4. ~~Deletion ledger~~ — done
5. ~~Consent tracking (DB model + registration + management UI)~~ — done
6. ~~Cookie consent for Google Maps~~ — done
7. DPA template
8. DPIA
9. RoPA
10. Sub-processor list

### Priority 2 — Build after launch
11. Audit logging
12. Log PII redaction
13. Data retention automation (cleanup jobs)
14. DSAR management interface
15. Right to restriction
16. Breach notification tooling

### Priority 3 — Enhanced compliance
17. Right to object workflow
18. Consent version tracking with policy snapshots
19. Platform admin access logging
20. Automated inactive user notifications
