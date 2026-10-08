# CLAUDE.md

## Project Overview

StreamTube — a video sharing platform (YouTube-like). Users can upload, manage, and publish videos. Anonymous users can watch freely; social features (comments, subscriptions, likes) require authentication.

More info in the project overview: [docs/project-plan.md](docs/project-plan.md)

## Repository Structure

This is a monorepo with two main areas:

- `nestjs-project/` — Backend API (NestJS 11, TypeScript, Express). Contains modules for users, channels, videos, comments, etc.
- `docs/` — Project documentation, architecture diagrams, and planning.
- `next-frontend/` (Next.js) — not yet initialized

## Architecture (C4 Container Diagram)

See `docs/diagrams/software-arch.mermaid` for the full diagram. Key containers:

- **Frontend** (Next.js) → calls API via REST, streams from Object Storage
- **API** (Nest.js) → business rules, auth, reads/writes DB, uploads to storage, publishes jobs to queue, sends emails
- **Video Worker** (FFmpeg) → consumes jobs from queue, processes videos, updates DB and storage
- **Database** (PostgreSQL) → users, channels, videos, comments, likes
- **Object Storage** (S3/MinIO) → video files and thumbnails
- **Message Queue** (TBD) → video processing job queue
- **Email Service** (SMTP) → account confirmation and password recovery

## Docker Networking

This project runs entirely in Docker containers. When configuring connections between services (database, cache, queue, etc.), **always use the Docker Compose service name** as the host — never `localhost` or `127.0.0.1`.

Inside a container, `localhost` refers to the container itself, not the host machine or other containers. Services communicate through the Docker Compose network using their service names (e.g., `db`, `nestjs-api`).

- **Correct:** `DB_HOST=db` (the Compose service name)
- **Wrong:** `DB_HOST=localhost`

This applies to all environment variables, configuration files, and code that references service hosts.

## Working Principles

- **Single Responsibility:** each module, service, and function should have a clear, focused responsibility. Re-evaluate adherence at every step — when a module starts owning logic or entities that are not its own (e.g., a service creating an entity from another domain), extract it immediately into the proper module instead of deferring to a later corrective task.
- **Type Safety:** Strict TypeScript usage across all layers.
- **Testing:** Strong emphasis on pyramid testing at all levels to ensure reliability and maintainability.
- **Code Quality:** Use ESLint and Prettier for consistent code style. Code reviews should focus on readability, maintainability, and adherence to best practices.
- **Documentation:** Comprehensive docs for architecture, setup, and troubleshooting in `docs/`.

## Definition of Done (Technical)

A change is only considered complete when **all** of the following pass:

1. The relevant test suite passes (unit + integration + e2e affected by the change).
2. The full test suite passes before finishing the task.
3. TypeScript compiles cleanly: `npx tsc --noEmit` exits with code 0. Compilation errors must never be left as debt for future tasks.
4. Lint passes: `npm run lint`.

If any of these fails, the task is not done — fix the underlying issue before declaring completion.


## Git Conventions

- **Main branch:** `main` — never commit directly to it
- Branches: `feature/*`, `bugfix/*`, `hotfix/*`, `docs/*`
- **Commits:** short, descriptive messages focused on the "why" of the change
- **Workflow:** Git Flow conventions. Two long-lived branches:
  - `main` — stable, production-ready code 
  - `dev` — integration branch; all feature/bugfix/hotfix branches start from `dev` and merge back into `dev`
  - When `dev` is stable, it is merged into `main`

## Testing Policy

Every change must be tested. During development, run only the tests related to the modified code. Before finishing, always run the full test suite to ensure nothing is broken.

## Scope Limits

- Work on **one feature, fix, or refactoring at a time** — do not mix scopes
- Do not include cosmetic changes (formatting, renaming) alongside functional changes
- If something out of scope comes up during work, do not act on it — open a GitHub issue for it (see [Issue Tracking](#issue-tracking))
- Focus on the defined scope for each task to ensure clarity and maintainability of the codebase.

## Issue Tracking

Whenever a problem is found (bug, tech debt, failing/flaky test, missing validation, doc inconsistency, needed refactor, etc.) and it does not make sense to fix it in the current session — because it is out of scope, too large, or needs a separate decision — **open a GitHub issue immediately** instead of only mentioning it in the conversation or leaving a `TODO` in the code.

- **Issue creation must be delegated to a subagent** (via the Agent tool) — the main thread never runs `gh issue create` itself. Pass the subagent all the context it needs (problem description, file paths/line numbers, reproduction steps, suggested fix), since it starts without the conversation history; it returns the created issue URL
- The subagent uses the `gh` CLI: `gh issue create --title "<short summary>" --body "<details>"`
- The body must include: what the problem is, where it was found (file paths/line numbers), how to reproduce or observe it, and any suggested fix or context gathered so far
- Check for an existing issue first (`gh issue list --search "<keywords>"`) to avoid duplicates
- Report the created issue URL(s) to the user at the end of the task

### Closing issues

An issue is resolved once its fix is **merged into `dev`** — close it then, without waiting for the `dev → main` merge.

- GitHub's `Closes #N` / `Fixes #N` keywords only auto-close issues when the PR is merged into the default branch (`main`). PRs targeting `dev` do **not** close their issues automatically
- Still reference the issue in the PR description (e.g., `Resolves #N`) so the link is visible
- After the PR is merged into `dev`, close each issue manually with a comment pointing to the PR: `gh issue close <N> --comment "Resolved by #<PR> (merged into dev)"`
- Do not close an issue while its PR is still open — if asked to, point out the PR is not merged yet and confirm first

## Terminal Command Hygiene

Some shell command shapes trigger the harness's human-review (permission) prompt and interrupt the workflow. Agents must avoid them unless strictly necessary:

- **Do not prefix commands with `cd`.** The working directory is already the repository root. Use absolute/relative paths or the tool's own directory flag instead:
  - `npm --prefix nestjs-project run test` instead of `cd nestjs-project && npm run test`
  - `npx tsc --noEmit -p nestjs-project` instead of `cd nestjs-project && npx tsc --noEmit`
  - `git -C <path> ...` instead of `cd <path> && git ...`
  - `docker compose -f <path>/<compose-file> ...` instead of `cd <path> && docker compose ...` (the Compose files in this repo are `nestjs-project/compose.yaml` and `next-frontend/compose.yaml`)
- **Avoid compound commands** (`&&`, `||`, `;`, pipes) when separate tool calls would do. Independent commands should be issued as parallel tool calls; dependent ones as sequential calls.
- **Avoid command substitution** (`$(...)`, backticks) and output redirection to files (`>`, `>>`) unless there is no alternative.
- **Prefer the dedicated tools** over shell equivalents: Read instead of `cat`/`head`/`tail`, Grep instead of `grep`/`rg`, Glob instead of `find`/`ls -R`, Edit/Write instead of `sed`/`echo >`.
- Write temporary files only to the session scratchpad directory, never outside the project or to system temp folders.

Use `cd` (or any of the shapes above) only when the command genuinely cannot run otherwise — e.g., a tool with no directory flag that depends on the current working directory — and keep it to a single, simple command.

## Agent Skill Usage

When working on any task (planning, implementing, debugging, refactoring, 
reviewing, etc.), decompose the request into its underlying subtasks and 
concerns, then identify which available skills match any of them and activate 
those skills.

## Library Documentation Lookup

Before implementing any feature, you MUST use the **context7** MCP tool to look up the relevant library APIs and official documentation.

Always:

- Check the installed library version in the project manifest
- Retrieve the corresponding documentation using context7
- Cross-reference APIs to avoid deprecated or incompatible patterns
- Follow the official documentation over training data

Skip documentation lookup only for trivial operations such as:

- Variable declarations
- Basic control flow
- Simple CRUD using established project patterns

If a library is involved and there is uncertainty, documentation lookup is mandatory.
If the documentation returned does not match the installed version, flag the discrepancy before proceeding.