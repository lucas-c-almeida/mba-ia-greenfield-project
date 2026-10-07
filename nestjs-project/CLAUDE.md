# CLAUDE.md

## Environment Startup Verification

**Default behavior:** starting the environment means starting **only infrastructure services** (database, mail, etc.) — **never** start the NestJS application server unless the user explicitly asks to run/serve the project (e.g., "rode o projeto", "suba o servidor", "run the app").

After starting infrastructure, always confirm the containers are up before proceeding:

```bash
docker compose -f nestjs-project/compose.yaml ps   # all services must show status "running"
```

Then verify each infrastructure service is actually ready to accept connections — not just running:

- **PostgreSQL:** `docker compose -f nestjs-project/compose.yaml exec db pg_isready -U streamtube` — expect `accepting connections`

Only start the NestJS dev server (`npm run start:dev`) when the user **explicitly** asks to run the application — never as part of "start the environment".

## Development Environment

This project runs inside Docker. Always use the container for development.

The Compose file lives at `nestjs-project/compose.yaml`. Every command in this document is written to run from the **repository root** — the Compose file is always passed explicitly with `-f nestjs-project/compose.yaml`, so no `cd` is needed (see the root `CLAUDE.md` → "Terminal Command Hygiene"):

```bash
# Create the local .env from the template (first step on a fresh clone)
cp nestjs-project/.env.example nestjs-project/.env

# Start containers
docker compose -f nestjs-project/compose.yaml up -d

# Install dependencies (first time only)
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm install

# Run the dev server (watch mode)
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm run start:dev
```

Services:
- `nestjs-api` — NestJS API, port `3000`
- `db` — PostgreSQL 17, port `5432`, database `streamtube`, user/password `streamtube`

All verification and teardown commands run on the **host machine**:

```bash
# Verify NestJS is running (expect 200 + "Hello World!")
curl http://localhost:3000

# Verify PostgreSQL is ready (runs inside the db container)
docker compose -f nestjs-project/compose.yaml exec db pg_isready -U streamtube

# Check container logs
docker compose -f nestjs-project/compose.yaml logs nestjs-api
docker compose -f nestjs-project/compose.yaml logs db

# Tear down the entire environment
docker compose -f nestjs-project/compose.yaml down
```

## Commands

**Strict rule:** every `npm`, `npx`, `node`, `tsc`, and test command runs **inside the container**, never on the host. Running on the host causes env-var divergence (`DB_HOST` resolves to `localhost` instead of the Compose service), uses a different Node version, and produces results that do not reflect what runs in CI/prod.

### Container-only commands (always prefix with `docker compose -f nestjs-project/compose.yaml exec nestjs-api`)

```bash
npm run start:dev                        # Dev server with hot-reload
npm run build                            # Compile to dist/
npm run start:prod                       # Run compiled build

npm test                                 # Unit + integration tests (testRegex matches both)
npm run test:integration                 # Integration tests only (already with --runInBand)
npm run test:watch                       # Unit + integration tests in watch mode
npm run test:cov                         # Coverage report over unit + integration
npm run test:e2e                         # End-to-end tests (always with --runInBand)
npm run test:debug                       # Unit + integration under the Node inspector

npx tsc --noEmit                         # Type-check (required before declaring a task done)
npm run lint                             # ESLint with auto-fix
npm run format                           # Prettier formatting

npm run migration:run                    # Apply pending migrations
npm run migration:revert                 # Roll back the last applied migration
npm run migration:generate -- <path>     # Generate a migration from the entity diff
npm run migration:create -- <path>       # Create an empty migration
npm run openapi:export                   # Regenerate nestjs-project/openapi.json
```

### Host-only commands (Docker / connectivity probes)

```bash
docker compose -f nestjs-project/compose.yaml ps
docker compose -f nestjs-project/compose.yaml logs nestjs-api
docker compose -f nestjs-project/compose.yaml exec db pg_isready -U streamtube
curl http://localhost:3000
```

### Test execution

Which script runs which subset — Jest's `testRegex` (`package.json`) matches both `*.spec.ts` and `*.integration-spec.ts`, so `npm test` is **not** unit-only:

| Script                     | Runs                                              |
|----------------------------|---------------------------------------------------|
| `npm test`                 | Unit **and** integration specs together           |
| `npm run test:integration` | Integration specs only (own `testRegex`)          |
| `npm run test:e2e`         | E2E specs only (own config, `test/jest-e2e.json`) |

There is no unit-only script: to run unit specs alone, pass their paths to `npm test`.

Integration and e2e suites share a single test database. They **must** be run with `--runInBand`:

```bash
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm test -- --runInBand
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm run test:integration   # already configured
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm run test:e2e           # already configured
```

Parallel execution causes FK violations, deadlocks, and cross-suite contamination because suites truncate or seed shared tables concurrently.

During active development, run only the tests related to the file being changed — `npm test -- path/to/file.spec.ts` for a unit spec, `npm run test:integration` for the integration suite alone instead of the full unit+integration run. Before declaring a task done, run the full suite — see the global `CLAUDE.md` → "Definition of Done (Technical)".

To debug a failing spec, `npm run test:debug` runs the same unit+integration selection under the Node inspector with `--inspect-brk` (already in band). It **halts before the first line and waits for a debugger to attach**, so treat it as a long-running process — it never exits on its own.

### Open handles false positive (`--detectOpenHandles`)

Historically `--detectOpenHandles` always reported a `CustomGC` open handle blaming `src/mail/mail.module.ts`: a napi-rs custom-GC async resource from the native `@css-inline/css-inline`, pulled in by `@nestjs-modules/mailer`'s `HandlebarsAdapter`. It never held the event loop — napi-rs's resource does not expose `hasRef()`, so Jest listed it unconditionally.

That package left the tree when the mail layer moved to `nodemailer` + `handlebars` directly (issue #37), and the handle is gone with it:

```bash
docker compose -f nestjs-project/compose.yaml exec -T nestjs-api npm test -- --runInBand --detectOpenHandles src/mail
# → 2 suites / 6 tests passing, no open handles reported
```

The conclusion that outlives the handle: `--forceExit` is **not** needed. The suite exits on its own, so if a run really does hang, look for a handle that genuinely holds the loop instead of masking it.

### Known harmless test-output warnings

Every Jest process — in both the unit+integration suite and the e2e suite — prints this once:

```
Warning: `--localstorage-file` was provided without a valid path
```

It is **harmless** and not a project defect. The origin is Node 25's experimental Web Storage: `jest-environment-node`'s global cleanup (`GlobalProxy.clear`, called from `NodeEnvironment.teardown`) walks the global object and in doing so touches the `localStorage` getter, and Node warns because the process was not started with `--localstorage-file <path>`. It is **not** project code and **not** a misconfigured flag — no occurrence of `localstorage-file` exists anywhere in the repository or in `node_modules`, and `NODE_OPTIONS` is empty in the container.

It is **deliberately not suppressed**. `--no-warnings` (or an equivalent Jest/Node flag) would also hide warnings that do matter — notably the `pg` deprecation tracked in issue #22 — so do not add a suppression flag to silence it.

Observed with Node **v25.6.0** and `jest-environment-node` **30.3.0**; re-check this note if either is upgraded.

## Dependency Audit (`npm audit`)

The findings `npm audit` reports on this lock are **known and accepted**. Do **not** run `npm audit fix --force` to clear them: on this graph `--force` downgrades `jest@30` to `jest@25.0.0` (a 2020 release, five majors back) and `ts-jest` to `29.1.2`, wrecking the test tooling in order to silence advisories in build-time code.

Measured inside the container on **2026-10-07**, on the lock after `npm ci`:

| Scope                                   | Findings                  |
|-----------------------------------------|---------------------------|
| `npm audit`                             | 21 — 21 moderate, 0 high  |
| `npm audit --omit=dev` (runtime tree)   | 2 — 2 moderate, 0 high    |

Re-measure before quoting these numbers — the count also moves as new advisories are published, with no change to the lock.

### Accepted: the `js-yaml` / `sprintf-js` cluster (the moderates)

Chain: `sprintf-js@1.0.3` → `argparse@1.x` → `js-yaml@3.15.2` → `@istanbuljs/load-nyc-config` → the whole Jest graph. 19 of the 21 moderate entries are Jest/istanbul packages, absent from the runtime tree.

Accepted because:

- they are development dependencies — never shipped to production
- the YAML they parse is the project's own nyc/coverage config, not untrusted input
- npm's proposed fix is a downgrade: `jest@25.0.0` / `ts-jest@29.1.2`, flagged `isSemVerMajor: true`

**Revisit when `@istanbuljs/load-nyc-config` moves off `js-yaml@3`**, then reinstall and re-measure.

Note: the same `js-yaml` audit entry also covers the `js-yaml@5.x` bundled under `@nestjs/swagger`, which **is** a runtime dependency and is therefore not part of this acceptance.

### Resolved: `nodemailer` (the former high) — issue #37

The single `high` used to be `nodemailer@9.1.1`, unreachable to fix because `mailparser@3.9.20` pinned `"nodemailer": "9.1.1"` exactly and `preview-email@3.4.1` wanted `^9.1.1` — both reachable only through `@nestjs-modules/mailer`'s optional dependencies.

Omitting those optional dependencies is **not** a usable workaround: `npm` only omits optional dependencies wholesale (`--omit=optional`), and that also drops the platform binary of `@css-inline/css-inline`, a non-optional dependency of `@nestjs-modules/mailer` that ships its native build through its own `optionalDependencies`. The mailer then fails to load at all.

So `@nestjs-modules/mailer` was dropped and the mail layer now uses `nodemailer` + `handlebars` directly (`src/mail/`). `nodemailer` is a direct dependency at `10.x`, and `mjml`, `liquidjs`, `preview-email`, `mailparser`, `pug`, `html-to-text`, `svgo` and `@css-inline/css-inline` left the tree with it.

### If `npm audit` ever becomes a CI gate

Use `--audit-level=high`. That is the honest option: it passes today and still fails the moment a `high` appears, instead of pretending the accepted moderates are gone.

## Long-running Processes

Commands that never exit (dev server, watch modes) must be run in background in the Bash tool — otherwise the agent blocks indefinitely waiting for the process to return.

This applies to: `start:dev`, `start:prod`, `test:watch`, and any other persistent process.

## Test Type Selection

Choose the suffix by what the test really does, not by where the code under test lives. The suffix is a contract that drives Jest config (`testRegex`, parallelism), CI steps, and reader expectations.

| Suffix                  | Purpose                                                              | DB / external I/O | Location                     |
|-------------------------|----------------------------------------------------------------------|-------------------|------------------------------|
| `*.spec.ts`             | **Unit** — pure logic, all collaborators mocked                      | Forbidden         | Next to the source file      |
| `*.integration-spec.ts` | **Integration** — exercises real DB, real repositories, real modules | Required          | Next to the source file      |
| `*.e2e-spec.ts`         | **End-to-end** — full HTTP cycle via `supertest`                     | Required          | `nestjs-project/test/`       |

A test that constructs a `TypeOrmModule.forRoot`, opens a connection, or hits the `db` service **must** be `*.integration-spec.ts`, never `*.spec.ts`. A test that boots the full Nest application and makes HTTP calls **must** be `*.e2e-spec.ts`.

Conventions for **how to write** each kind of test (mocking patterns, AAA structure, override strategies for global guards, etc.) live in `.claude/rules/nestjs-testing.md` and load when you edit a test file.

## Jest Configuration

These settings are required in `package.json` (jest config) and `test/jest-e2e.json` for the project's tests to work correctly:

- `setupFiles: ["dotenv/config"]` — without this, `.env` is not loaded inside the Jest process. `DB_HOST`, `JWT_SECRET`, etc. fall back to undefined or to the host's `localhost`, breaking container-to-container DNS.
- `testRegex: '.*\\.(spec|integration-spec)\\.ts$'` — covers both unit (`*.spec.ts`) and integration (`*.integration-spec.ts`) suffixes.
- `testTimeout: 30000` (in both configs) — bootstrapping modules against the real DB exceeds Jest's 5s default on Docker Desktop (slow bind mount, container clock jumps), failing `beforeAll` hooks.
- `globalSetup: "<rootDir>/global-setup.ts"` (e2e config only) — builds the database schema by running the project's migrations once, before any e2e spec. The e2e specs boot the real `AppModule`, which uses the production TypeORM config (`synchronize: false`, no `migrationsRun`) and therefore creates nothing; without this hook the e2e suite only passed when a previous `npm test` or a manual `npm run migration:run` had already built the schema. `test/global-setup.ts` reuses `createTestDataSource` (`migrations: ALL_MIGRATIONS` + `migrationsRun: true`), so it is idempotent and never deletes data. It must `import 'dotenv/config'` itself: `setupFiles` does not apply to `globalSetup`.

Do not add new test-file suffixes; if a new test type is needed, update the regex deliberately.

## Environment File Conventions

`.env` is parsed by both Docker Compose and `dotenv` — values containing shell-special characters (`<`, `>`, `|`, `&`, spaces) **must be quoted** or rewritten:

```dotenv
# Wrong — the unquoted angle brackets are shell redirection syntax and break parsing
MAIL_FROM=StreamTube <noreply@streamtube.local>

# Right — quote the value
MAIL_FROM="StreamTube <noreply@streamtube.local>"

# Right — when the value itself contains double quotes, wrap it in single quotes
MAIL_FROM='"StreamTube" <noreply@streamtube.local>'
```

The quotes must wrap the **whole** value. Leaving part of it outside (`MAIL_FROM="StreamTube" <noreply@...>`) is accepted by `dotenv` but rejected by Docker Compose, which reads `nestjs-project/.env` for interpolation on every command — so *any* `docker compose ...` call fails with `unexpected character "<" in variable name`.

Whenever possible, prefer storing only the bare address in `.env` and composing display names in code (e.g., in `mail.config.ts`) so the file stays shell-safe.

### Fresh clone

`.env` is git-ignored, so a freshly cloned repository has only `.env.example`. Create it before anything else:

```bash
cp nestjs-project/.env.example nestjs-project/.env
```

Without `.env`, Jest loads no environment (`setupFiles: ["dotenv/config"]` finds nothing) and the suites fail with `secretOrPrivateKey must have a value`.

## Build Assets

`tsc` (and therefore `nest build`) only emits compiled `.ts` files to `dist/`. Any non-TypeScript runtime asset — Handlebars templates (`.hbs`), JSON fixtures, static config files, etc. — must be declared in `nest-cli.json` under `compilerOptions.assets` (with `watchAssets: true` for dev). Without that, the file exists in `src/` but is missing in `dist/` and runtime fails only after build.

## Architecture

NestJS with standard module structure. Source lives in `src/`, compiled output in `dist/`.

- Each domain feature gets its own module (e.g., `UsersModule`, `VideosModule`) registered in `AppModule`
- Controllers handle HTTP routing; Services hold business logic; both are scoped to their module

## Code Conventions

- **TypeScript:** `nodenext` module resolution, `ES2023` target, `strictNullChecks` on, `noImplicitAny` off
- **Decorators:** `emitDecoratorMetadata` + `experimentalDecorators` enabled — required for NestJS DI
- **Prettier:** single quotes, trailing commas everywhere
- **ESLint:** `no-explicit-any` allowed; `no-floating-promises` and `no-unsafe-argument` are warnings

## REST Conventions

This is a RESTful API. All endpoints must follow standard REST conventions — correct HTTP methods, proper status codes, plural resource nouns, and consistent URL structure. Details are enforced via rules on controller files.
