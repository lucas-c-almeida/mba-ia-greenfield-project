import type { MigrationInterface } from 'typeorm';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';

/**
 * Every migration of the project, in execution order.
 *
 * `ts-jest` does not reliably resolve TypeORM's glob patterns inside the Jest
 * sandbox, so test data sources must receive the migration classes explicitly
 * (see `.claude/rules/typeorm-migrations.md`). Add every new migration here —
 * otherwise the integration suites build an outdated schema.
 *
 * This file lives outside `migrations/` on purpose: the runtime glob in
 * `data-source.ts` (`src/database/migrations/*.ts`) would otherwise load these
 * classes twice.
 */
export const ALL_MIGRATIONS: (new () => MigrationInterface)[] = [
  CreateUsersAndChannels1775687773260,
  CreateAuthTokens1777579850478,
];
