import type { MigrationInterface } from 'typeorm';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';

/**
 * Every migration of the project, in execution order.
 *
 * This is the single authoritative list: both the runtime `data-source.ts`
 * (used by the `migration:*` CLI scripts) and the test data sources in
 * `src/test/create-test-data-source.ts` consume it, so the CLI and the
 * integration suites can never apply different sets of migrations. Explicit
 * classes are also the only reliable form under `ts-jest`, which does not
 * resolve TypeORM's glob patterns inside the Jest sandbox (see
 * `.claude/rules/typeorm-migrations.md`).
 *
 * Add every new migration here — otherwise the integration suites build an
 * outdated schema. `all-migrations.spec.ts` enforces that this list matches the
 * files in `migrations/`, so a forgotten registration fails the suite.
 *
 * This file lives outside `migrations/` on purpose: it is not a migration, and
 * that guard test treats every file in `migrations/` as one.
 */
export const ALL_MIGRATIONS: (new () => MigrationInterface)[] = [
  CreateUsersAndChannels1775687773260,
  CreateAuthTokens1777579850478,
];
