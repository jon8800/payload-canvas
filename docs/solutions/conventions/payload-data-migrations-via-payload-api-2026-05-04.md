---
title: Use the Payload local API for data migrations, not raw SQL
date: 2026-05-04
category: conventions
module: apps/starter
problem_type: convention
component: database
severity: medium
applies_when:
  - Migrating data shape across collections (e.g., consolidating per-field columns into a single JSON field)
  - Backfilling values across existing documents
  - Any data transformation that must work across multiple Payload database adapters
  - Writing migration scripts that may need to run more than once
tags: [payload, migrations, postgres, data-migration]
related_components: [tooling]
---

# Use the Payload local API for data migrations, not raw SQL

## Context

The v1.1 milestone collapsed many per-property style fields on every block into a single JSON `styles` field. The migration touched every existing block document across Pages, Posts, and Template Parts. The temptation was to write a Postgres `UPDATE` with `jsonb_build_object` to do it in one round-trip — but that locks the migration to Postgres, can't easily handle nested blocks, and bypasses Payload's hooks and validation.

## Guidance

Write data migrations as Node scripts that use the Payload **local API** (`payload.find`, `payload.update`) rather than raw SQL.

```ts
import { getPayload } from 'payload'
import config from '@payload-config'

const payload = await getPayload({ config })

const { docs: pages } = await payload.find({
  collection: 'pages',
  limit: 1000,
  depth: 0,
})

for (const page of pages) {
  const updatedLayout = page.layout?.map(transformBlockStyles) ?? []

  await payload.update({
    collection: 'pages',
    id: page.id,
    data: { layout: updatedLayout },
    overrideAccess: true,
    context: { skipMigration: false },
  })
}
```

Make the transform **idempotent** — if a block already has the new shape, skip it. That way the migration can be re-run safely if it crashes mid-way.

## Why This Matters

- **Cross-adapter compatibility.** Payload v3 supports Postgres, SQLite, and MongoDB adapters. The local API is identical across all three; raw SQL ties the migration to one backend.
- **Hooks and validation run.** Field hooks, beforeChange validators, and access control fire on `payload.update` — so the migrated data is guaranteed to be valid post-migration. Raw SQL can produce malformed documents that pass schema constraints but fail Payload's validation later.
- **Nested blocks work transparently.** Payload's local API understands the block tree. Walking nested blocks in SQL with `jsonb_path_query` is technically possible but brittle — the recursion lives in your code, where it can be tested.
- **Idempotency is straightforward.** A guard like `if (block.styles) return block` keeps the script safe to re-run.

## When to Apply

- Any migration that transforms document data, not just schema
- Backfills, data shape consolidations, enum value renames
- Any scripted data work that should survive a future database adapter swap

## Examples

The v1.1 block style migration is the canonical example: 14 block types × thousands of nested instances × Pages + Posts + Template Parts collections, all migrated via a single Node script using `payload.find` + `payload.update` with an idempotent transform.

Anti-pattern that was rejected:

```sql
-- DON'T do this for data migrations
UPDATE pages
SET layout = jsonb_set(layout, '{0,styles}', /* ... */)
WHERE /* ... */;
```

## Related

- Local CLAUDE.md rule: never run `payload migrate` against the local dev database (push: true is in use).
