# Contributing to Unitae

Thank you for your interest in Unitae! This guide explains how to contribute to the project.

## Getting Started

Set up your development environment by following the [Development Setup](docs/development/getting-started.md) guide.

## Contribution Process

1. **Open an issue** to discuss your idea before starting any significant work
2. **Fork** the repository and create a branch from `main`
3. **Implement** your changes following the [coding conventions](docs/development/coding-conventions.md)
4. **Verify** everything passes:
   ```bash
   pnpm build:format
   pnpm test:typecheck
   pnpm test:lint
   pnpm test:unit
   pnpm build
   ```
5. **Open a pull request** with a clear description of your changes

## Language

- **UI text**: in `app/i18n/messages/`, never written in the code. French and English carry every key.
- **Code comments, commits, PRs, and documentation**: English
- **Commit format**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, etc.)

## Translating Unitae

Unitae can be used in any language that has a message file. You do not need to write code to
translate it.

### What to translate

1. **Open an issue** to say which language you will translate, so two people do not do the same work.
2. **Create one file**, `app/i18n/messages/<code>.json`, named with the language code: `uk.json` for
   Ukrainian, `ru.json` for Russian, `de.json` for German.
3. **Start from `app/i18n/messages/en.json`**: copy it and translate every value. Keep every key (the
   text on the left) exactly as it is.
4. **Add your language code** to `languageTags` in `app/i18n/project.inlang/settings.json`, for example
   `["en", "fr", "uk"]`.

The first pull request for a language must translate **every** message, so nobody sees a mix of
languages. After that, new features may add English messages before they are translated: a message
your file does not have yet shows in English.

### Use the official words

Congregations use precise terms (publisher, field service group, territory assignment, field service
report…). Use the words your language uses on [jw.org](https://www.jw.org) and in the
[Watchtower Online Library](https://wol.jw.org). The [translation glossary](docs/development/translation-glossary.md)
lists the English and French terms; find the same publication in your language for yours.

### Keep what is between braces

- `{name}`, `{count}`, `{date}` are filled in by the app. Keep them exactly, in the place your sentence
  needs them. Do not translate the word between the braces.
- Keep line breaks (`\n`) where they are.

### Plurals

A message that shows a count lists one text per form. English has two forms:

```json
"groups_list_publishers": [{
  "declarations": ["input count", "local countPlural = count: plural"],
  "selectors": ["countPlural"],
  "match": {
    "countPlural=one": "{count} publisher",
    "countPlural=*": "{count} publishers"
  }
}]
```

Write the forms your language needs, and always keep the last one, `=*`, which is used for any other
number. Ukrainian and Russian use `one` (1, 21, 31…), `few` (2–4, 22–24…) and `many` (5–20, 25–30…):

```json
  "match": {
    "countPlural=one": "{count} вісник",
    "countPlural=few": "{count} вісники",
    "countPlural=many": "{count} вісників",
    "countPlural=*": "{count} вісника"
  }
```

Keep `declarations` and `selectors` as they are. A few messages have a line such as `countExact=1`
for a sentence used only for exactly one item: translate it like the others.

### Check your work

Run the tests: they check that your file only uses keys English has, keeps the same placeholders, and
ends every plural with `=*`.

```bash
pnpm test:unit app/i18n
```

To see the result, start the app (see [Getting Started](#getting-started)) and choose your language in
**My account › Preferences**. Then open a pull request.

## Code Conventions

See [Coding Conventions](docs/development/coding-conventions.md) for the full guide, including:

- Development philosophy and architecture patterns
- Code style (Biome configuration)
- Service layer pattern
- Database patterns (scoped vs unscoped queries)
- Testing philosophy (black-box testing)

## Database Migrations

- The Prisma schema is in `app/database/schema.prisma`
- After modifying the schema, generate a migration:
  ```bash
  pnpm prisma migrate diff \
    --from-config-datasource \
    --to-schema app/database/schema.prisma \
    --script > migration.sql
  ```
- Create the migration directory manually in `app/database/migrations/`
- Do not use `prisma migrate dev` (it does not work in non-interactive mode)

## Reporting a Bug

Open an [issue](https://github.com/Unitae/unitae/issues/new?template=bug_report.yml) with:

- Steps to reproduce the problem
- Expected vs observed behavior
- Your environment (OS, Node.js, browser)

## Proposing a Feature

Open an [issue](https://github.com/Unitae/unitae/issues/new?template=feature_request.yml) describing:

- The problem you are trying to solve
- Your proposed solution
- Alternatives you considered

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Do not create a public issue for security problems.
