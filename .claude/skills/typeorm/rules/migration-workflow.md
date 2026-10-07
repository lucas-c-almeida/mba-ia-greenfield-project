---
title: Migration Workflow
impact: HIGH
impactDescription: Using synchronize in production causes data loss; skipping migrations leads to schema drift
tags: migration, cli, synchronize, production, workflow
---

## Migration Workflow

**Impact: HIGH (synchronize in production causes data loss; skipping migrations leads to schema drift)**

Always use migrations for schema changes. Never use `synchronize: true` in production.

**Incorrect (using synchronize instead of migrations):**

```typescript
// data-source.ts
export const AppDataSource = new DataSource({
  // ...
  synchronize: true, // DANGEROUS: drops columns/tables to match entities
});
```

**Correct (migration-based workflow):**

```typescript
// src/database/data-source.ts
export const AppDataSource = new DataSource({
  // ...
  synchronize: false, // never true, in any environment
  migrations: ['src/database/migrations/*.ts'],
});
```

### CLI Commands

Use the `package.json` scripts, never `npx typeorm` directly: they already carry
`-d src/database/data-source.ts`, so the data source path cannot drift. Every
`npm`/`npx` command runs inside the container — see `nestjs-project/CLAUDE.md` →
"Commands".

```bash
# Generate migration from entity changes (compares entities vs current schema)
docker compose exec nestjs-api npm run migration:generate -- src/database/migrations/CreateUsers

# Create empty migration (for custom SQL, seeds, data migrations)
# the only script without `-d`: it writes a file, it never touches the database
docker compose exec nestjs-api npm run migration:create -- src/database/migrations/SeedUsers

# Run pending migrations
docker compose exec nestjs-api npm run migration:run

# Revert last migration
docker compose exec nestjs-api npm run migration:revert
```

Migrations must land in `src/database/migrations/` — the only directory
`data-source.ts` scans. A migration written anywhere else is never picked up and
`migration:run` reports no error.

### Workflow

1. Modify entity (add/change columns, relations)
2. Run `migration:generate` to auto-generate the migration
3. Review the generated SQL — never blindly run generated migrations
4. Run `migration:run` to apply
5. Commit both the entity change and the migration file together

**Key points:**
- `synchronize: false` in every environment — see `.claude/rules/typeorm-migrations.md` → "Safety"
- Development and tests included: `src/test/create-test-data-source.ts` builds the test schema with `migrations: ALL_MIGRATIONS` + `migrationsRun`, so the suites exercise the same schema path as production
- There is no `DB_SYNCHRONIZE` variable to toggle: `synchronize: false` is hardcoded in `src/database/data-source.ts`, `src/app.module.ts` and `src/test/create-test-data-source.ts`, and the project's Joi validation (`src/config/env.validation.ts`, wired through `ConfigModule.forRoot({ validationSchema })`) does not declare one
- Use `migration:generate` for schema changes, `migration:create` for data/seed migrations
- Always review generated migrations before running them
- Commit entity changes and migration files in the same commit
- In CI/CD, run `migration:run` as part of the deployment pipeline

Reference: [TypeORM Migrations](https://typeorm.io/migrations)
