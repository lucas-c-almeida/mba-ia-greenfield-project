> Part of the `testing-guide-nestjs-project` skill (see `../SKILL.md`).

# Gotchas & Pitfalls

Stack-specific pitfalls for NestJS 11 + Jest 30 + TypeORM + PostgreSQL + ts-jest 29.

---

## 1. `repository.delete({})` throws on empty criteria

**Problem:** `repository.delete({})` throws `Empty criteria(s) are not allowed for delete.` in TypeORM.

**Fix:** Use `dataSource.query('DELETE FROM "table_name"')` or `repository.clear()` for table cleanup between tests.

```typescript
// BAD
await userRepository.delete({});

// GOOD
await dataSource.query('DELETE FROM "users"');
// or
await userRepository.clear();
```

For tables with foreign key dependencies, use `TRUNCATE ... CASCADE`:
```typescript
await dataSource.query('TRUNCATE "videos", "channels", "users" CASCADE');
```

---

## 2. `Test.createTestingModule()` does NOT execute `main.ts`

**Problem:** Global pipes, filters, interceptors, and prefixes set in `main.ts` are NOT applied in test modules. E2E tests that don't reproduce this config will behave differently from production.

**Fix:** Manually apply all global config in E2E test setup:

```typescript
beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();

  // Reproduce src/main.ts config — keep this block in sync with it
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new DomainExceptionFilter(),
    new ValidationExceptionFilter(),
  );

  await app.init();
});
```

That is exactly what `test/auth.e2e-spec.ts` and `test/swagger.e2e-spec.ts` do — copy it from there rather than from memory, and re-check `src/main.ts` whenever a new global pipe, filter or interceptor is added. Dropping `forbidNonWhitelisted` alone already changes the status code an unknown property produces, so the test would assert something production never returns.

**Tip:** Extract global config into a shared function used by both `main.ts` and E2E setup to keep them in sync.

---

## 3. Forgetting `app.close()` causes Jest to hang

**Problem:** If `afterAll(() => app.close())` is missing, Jest will hang after tests complete because database connections, queue connections, or HTTP server handles remain open.

**Fix:** Always close the app and data sources:

```typescript
afterAll(async () => {
  await app.close(); // closes all connections managed by NestJS
});

// For standalone DataSource (entity integration tests):
afterAll(async () => {
  await dataSource.destroy();
});
```

If Jest still hangs, find the handle that is actually holding the event loop — do not reach for `--forceExit`, which only masks a real leak. In particular, the `CustomGC` handle that `--detectOpenHandles` blames on `src/mail/mail.module.ts` is a proven false positive and never the cause: see `nestjs-project/CLAUDE.md` → "Open handles false positive (`--detectOpenHandles`)".

---

## 4. ts-jest version mismatch with Jest 30

**Problem:** The project uses Jest 30 but ts-jest 29.2.5. While ts-jest 29 is compatible with Jest 30 via a compatibility layer, you may encounter edge cases with ESM transforms or snapshot serializers.

**Fix:** Monitor for issues. If transform errors appear, check if ts-jest has released a version 30.x. Until then, the current setup works for the project's `commonjs` module output.

---

## 5. The test schema is built by migrations — `synchronize` is not an option

**Problem:** `synchronize` looks like the shortcut to get tables into the test database, but it is unavailable here and unsafe anyway. It creates tables and adds columns, yet never drops a table or removes a column — rename a column in an entity and the old one survives in the test DB. It also diverges from the schema path production uses, so a broken migration still passes. And TypeORM's schema builder issues concurrent `query()` calls on a single `pg` client: a `DeprecationWarning` today, a hard failure on `pg@9` (the `pg` deprecation tracked in issue #22).

**Fix:** Build the test schema by running the project's own migrations, via the shared helper `nestjs-project/src/test/create-test-data-source.ts`. `createTestDataSource` pins `synchronize: false` and initializes with `migrations: ALL_MIGRATIONS` (`src/database/all-migrations.ts`) plus `migrationsRun`, so there is no code path that accepts `synchronize: true`:

```typescript
import { ALL_ENTITIES } from '../database/all-entities';
import { createTestDataSource } from '../test/create-test-data-source';

beforeAll(async () => {
  dataSource = createTestDataSource(ALL_ENTITIES);
  await dataSource.initialize(); // runs ALL_MIGRATIONS and builds the schema
});
```

Pass `{ runMigrations: false }` only when the suite drives the migration runner itself (as `src/database/migrations.integration-spec.ts` does) — such a suite must restore the schema in `afterAll`: see `.claude/rules/typeorm-migrations.md` → "Migration Tests Must Restore DB State".

The entity list is shared the same way: import `ALL_ENTITIES` from `src/database/all-entities.ts` instead of redeclaring it per spec, and add every new entity there (`all-entities.spec.ts` fails if one is missing). Every new migration has to be added to `ALL_MIGRATIONS`, or the integration suites silently build an outdated schema. To reset *data* between tests, never rebuild the schema — use `cleanAllTables(dataSource)` from the same helper, or the `DELETE FROM` / `TRUNCATE ... CASCADE` patterns of §1.

---

## 6. PostgreSQL table names are case-sensitive in raw queries

**Problem:** TypeORM may generate table names in different cases. Raw queries like `DELETE FROM users` will fail if the table is actually `"Users"`.

**Fix:** Always quote table names in raw queries:
```typescript
// BAD
await dataSource.query('DELETE FROM users');

// GOOD
await dataSource.query('DELETE FROM "users"');
```

**Better:** Use the entity metadata to get the actual table name:
```typescript
const tableName = dataSource.getRepository(User).metadata.tableName;
await dataSource.query(`DELETE FROM "${tableName}"`);
```

---

## 7. E2E test imports vs unit test imports

**Problem:** E2E tests import `AppModule` (the full application), while unit/integration tests import only the specific module or providers. Mixing these up leads to slow tests or incomplete setups.

**Rule of thumb:**
- **E2E** (`*.e2e-spec.ts`): `imports: [AppModule]` → full app, real HTTP stack
- **Integration** (`*.integration-spec.ts`): `imports: [TypeOrmModule.forRoot(...), TypeOrmModule.forFeature([Entity])]` + specific providers
- **Unit** (`*.spec.ts`): `providers: [ServiceUnderTest, { provide: Dep, useValue: mock }]` — no module imports

The integration suffix is spelled with a **hyphen** before `spec`, never a dot: Jest's `testRegex` is `.*\.(spec|integration-spec)\.ts$`, so a file named `*.integration.spec.ts` is still collected (it ends in `.spec.ts`) but runs in parallel like a unit test, and `npm run test:integration` — whose own regex is `\.integration-spec\.ts$` — never selects it at all. See `nestjs-project/CLAUDE.md` → "Test Type Selection".

---

## 8. `jest.mock()` with NestJS DI — prefer `useValue` over `jest.mock()`

**Problem:** `jest.mock('./users.service')` at the module level replaces the entire module and fights with NestJS's DI system. It can cause subtle issues where the mock doesn't match the provider token.

**Fix:** Use NestJS's built-in DI mocking:
```typescript
// GOOD — works with NestJS DI
{ provide: UsersService, useValue: { findByEmail: jest.fn() } }

// AVOID — fights with NestJS DI
jest.mock('./users.service');
```

---

## 9. Parallel test execution and shared database

**Problem:** Jest runs test files in parallel by default. If multiple integration test files share the same database tables, they can interfere with each other (e.g., one test cleans a table while another is mid-assertion).

**Fix options:**
- Run integration tests with `--runInBand` to serialize execution
- Use transactions that rollback after each test (if feasible)
- Use schema-per-test-file isolation (complex but fully parallel)

The project already has a dedicated script for this — `npm run test:integration`, which selects only `*.integration-spec.ts` and is already `--runInBand`. Like every `npm`/`npx` command here, it runs inside the container (see `nestjs-project/CLAUDE.md` → "Commands"):
```bash
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm run test:integration
```

The full unit + integration run needs the flag passed explicitly, since `npm test` has none of its own:
```bash
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm test -- --runInBand
```

---

## 10. Supertest response types with `import request from 'supertest'`

**Problem:** With `moduleResolution: "nodenext"`, supertest's default import may require specific type imports.

**Fix:** Import as used in the project's existing E2E test:
```typescript
import request from 'supertest';
import { App } from 'supertest/types';

let app: INestApplication<App>;
```

This matches the existing `test/app.e2e-spec.ts` pattern and ensures type compatibility.

---

## 11. Password hashing in tests — the project uses argon2, and it is never mocked

**Problem:** Password hashing is intentionally slow, so a suite that hashes on every test case gets noticeably slower. The tempting shortcuts are mocking the hashing library or weakening its parameters.

**Fix:** Neither. The project hashes with **argon2** (`argon2.hash` / `argon2.verify` in `src/auth/auth.service.ts`) at the library's default parameters — there is no `bcrypt` dependency and no cost-factor constant to turn down. Keep calling the real library: `auth.service.spec.ts` asserts the produced hash actually starts with `$argon2`, and `auth.service.integration-spec.ts` verifies a stored hash with `argon2.verify` — both assertions are meaningless against a mock.

Pay for the hash once per describe block instead of once per test:
```typescript
let hashedTestPassword: string;

beforeAll(async () => {
  hashedTestPassword = await argon2.hash('correctpassword');
});
```

This is the pattern `src/auth/auth.service.spec.ts` already uses for its login suite.
