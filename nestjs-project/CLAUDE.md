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

Running the suite with `--detectOpenHandles` always reports a `CustomGC` open handle blaming `src/mail/mail.module.ts` — the `HandlebarsAdapter` import, which pulls in the native `@css-inline/css-inline`.

**It is a false positive.** That handle is napi-rs's custom-GC async resource, which does not expose `hasRef()`, so Jest cannot check whether it holds the event loop and lists it unconditionally. Proof that it is unref'd:

```bash
docker compose -f nestjs-project/compose.yaml exec -T nestjs-api node -e 'require("@css-inline/css-inline"); console.log(JSON.stringify(process.getActiveResourcesInfo()))'
# → [] with exit 0 — after loading the package Node has no active resources at all
```

So this handle is never why a run would hang: the suite exits on its own and `--forceExit` is **not** needed. If a run really does hang, ignore this handle and look for the cause elsewhere.

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

Measured inside the container on **2026-10-06**, on the `dev` lock after `npm ci`:

| Scope                                   | Findings                  |
|-----------------------------------------|---------------------------|
| `npm audit`                             | 24 — 23 moderate, 1 high  |
| `npm audit --omit=dev` (runtime tree)   | 5 — 4 moderate, 1 high    |

Re-measure before quoting these numbers — the count also moves as new advisories are published, with no change to the lock.

### Accepted: the `js-yaml` / `sprintf-js` cluster (the moderates)

Chain: `sprintf-js@1.0.3` → `argparse@1.x` → `js-yaml@3.15.2` → `@istanbuljs/load-nyc-config` → the whole Jest graph. 19 of the 23 moderate entries are Jest/istanbul packages, absent from the runtime tree.

Accepted because:

- they are development dependencies — never shipped to production
- the YAML they parse is the project's own nyc/coverage config, not untrusted input
- npm's proposed fix is a downgrade: `jest@25.0.0` / `ts-jest@29.1.2`, flagged `isSemVerMajor: true`

**Revisit when `@istanbuljs/load-nyc-config` moves off `js-yaml@3`**, then reinstall and re-measure.

Note: the same `js-yaml` audit entry also covers the `js-yaml@5.x` bundled under `@nestjs/swagger`, which **is** a runtime dependency and is therefore not part of this acceptance.

### Not handled here: `nodemailer` (the high) — issue #37

Installed version is `nodemailer@9.1.1`; the fix requires `10.x`. The audit JSON reports `fixAvailable: true`, which is **misleading in practice**: `mailparser@3.9.20` pins `"nodemailer": "9.1.1"` exactly and `preview-email@3.4.1` wants `^9.1.1`, so `10.x` is unreachable on this graph — which is why plain `npm audit fix` converges without ever touching it. Those two dependents also account for 2 of the moderate entries. Resolving it means changing the source of the chain, `@nestjs-modules/mailer`, which is the scope of **issue #37**.

### If `npm audit` ever becomes a CI gate

Use `--audit-level=high`. That is the honest option: it fails on the `nodemailer` high and lets the accepted moderates through, instead of pretending they are gone.

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
