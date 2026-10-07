---
paths:
  - 'nestjs-project/**/migrations/**'
  - 'nestjs-project/**/*data-source.ts'
description: 'Database migration safety rules'
---

# Migration Rules

## Immutability

- Never edit a migration that has already been executed — create a new one instead
- If a migration needs to be reverted, write a new migration that undoes the change

## Generation

- Always generate migrations via TypeORM CLI (`typeorm migration:generate` or `typeorm migration:create`)
- Never write migration SQL by hand unless the CLI cannot express the change (e.g., data migrations)

## Safety

- Never use `synchronize: true` in any environment — migrations are the only sanctioned way to change the schema
- Test migrations against a fresh database before considering them done
- Migrations must be idempotent where possible — use `IF EXISTS` / `IF NOT EXISTS` guards for DDL
- Migrations must be self-sufficient: never rely on the TypeORM Postgres driver enabling `uuid-ossp` from entity metadata. `EnableUuidOsspExtension1775687773259` creates it and carries a timestamp one millisecond **before** `CreateUsersAndChannels1775687773260` on purpose (TypeORM runs pending migrations in timestamp order, and the old migration is immutable). A new migration that needs a Postgres extension must create it itself; `migrations-standalone.integration-spec.ts` runs every migration on a fresh database with no entities to catch regressions

## Recovering from `synchronize` Residue

If you find entities in `src/` whose tables already exist in the database but have **no corresponding migration file on disk**, the database was previously populated by `synchronize: true` (or by a deleted migration). Do **not** try to "patch" the schema with a new migration on top — the generated diff will be empty and TypeORM will think everything is fine while the migration table is wrong.

Correct recovery:

1. Drop the orphan tables in the dev database (`DROP TABLE ... CASCADE`).
2. Clear the `migrations` table if it has stale rows.
3. Run `typeorm migration:generate` against the empty database — it will now produce a complete `CREATE TABLE` migration that matches the entities.
4. Run the new migration to recreate the tables cleanly.

## Migration Tests Must Restore DB State

Any test that exercises the migration runner (`runMigrations` / `undoLastMigration`) leaves the database in a non-default state. Other suites in the same Jest run will see missing tables and fail mysteriously.

Always restore the schema in `afterAll`:

```typescript
afterAll(async () => {
  await dataSource.runMigrations(); // re-apply everything that was undone
  await dataSource.destroy();
});
```

## Importing Migrations in Tests

`ts-jest` does not reliably resolve TypeORM's glob patterns (`migrations: ['dist/migrations/*.js']`) inside the Jest sandbox, so migration classes must be imported directly and passed as an array. That list is **not** duplicated per data source: `src/database/all-migrations.ts` exports `ALL_MIGRATIONS` as the single authoritative, ordered list, consumed both by the runtime `src/database/data-source.ts` (which the `migration:*` CLI scripts use) and by `createTestDataSource`:

```typescript
import { ALL_MIGRATIONS } from '../database/all-migrations';

new DataSource({
  // ...
  migrations: ALL_MIGRATIONS,
});
```

Every new migration must be added to `ALL_MIGRATIONS` — otherwise the integration suites build an outdated schema. `src/database/all-migrations.spec.ts` enforces this by comparing the list against the files in `src/database/migrations/` (names and order), so a forgotten registration fails the suite instead of failing mysteriously later.

Do not use a migrations glob in any data source, and keep `all-migrations.ts` outside `migrations/` — that guard test treats every file in `migrations/` as a migration.

## Test DataSource Entity Arrays

When constructing a `DataSource` for tests, pass entity classes explicitly — do **not** use glob strings:

```typescript
new DataSource({
  // ...
  entities: [User, Channel, RefreshToken, VerificationToken],
});
```

Glob entries (`'src/**/*.entity.ts'`) work in production via `ts-node` but break in `ts-jest` — explicit class arrays are the only reliable form in test data sources. The runtime `data-source.ts` keeps the **entities** glob on purpose: unlike a migration array it cannot go stale when a new entity is added, and a forgotten entity would make `migration:generate` emit a wrong diff instead of failing.

For TypeORM **query** pitfalls (`IsNull`, transactions, SAVEPOINT) that apply in service code, see `typeorm-queries.md`.
