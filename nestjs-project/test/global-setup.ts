import 'dotenv/config';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { VerificationToken } from '../src/auth/entities/verification-token.entity';
import { Channel } from '../src/channels/entities/channel.entity';
import { createTestDataSource } from '../src/test/create-test-data-source';
import { User } from '../src/users/entities/user.entity';

/**
 * Jest `globalSetup` for the e2e suites — builds the database schema once,
 * before any e2e spec runs.
 *
 * The e2e specs boot the real `AppModule`, whose TypeORM configuration is the
 * production one: `synchronize: false` and no `migrationsRun`. It connects but
 * creates nothing, so against a fresh (or wiped) database the suites failed
 * with `relation "refresh_tokens" does not exist`: the schema only ever existed
 * as a side effect of a previous `npm test` or a manual `npm run migration:run`.
 * That undocumented ordering dependency is what this file removes.
 *
 * The schema setup lives on the test side on purpose — `AppModule` is what
 * boots the real application, and making it run migrations at startup would be
 * a production behaviour change.
 *
 * `createTestDataSource` is the same helper the integration suites use: it
 * already configures `migrations: ALL_MIGRATIONS` + `migrationsRun: true`.
 *
 * The entity list is **required**, not decoration: `CreateUsersAndChannels`
 * defaults its primary keys to `uuid_generate_v4()`, and that function only
 * exists because TypeORM's Postgres driver creates the `uuid-ossp` extension on
 * connect — which it only does when entity metadata declares a generated uuid
 * column. With an empty entity array the first migration fails with
 * `function uuid_generate_v4() does not exist`.
 *
 * Idempotent by construction: TypeORM's migration runner reads the `migrations`
 * table and applies only what is pending, so running the e2e suite twice, or
 * right after `npm test`, is a no-op. It also never deletes rows, so the
 * fixtures the specs set up (and `cleanAllTables`) are unaffected.
 */
export default async function globalSetup(): Promise<void> {
  const dataSource = createTestDataSource([
    User,
    Channel,
    RefreshToken,
    VerificationToken,
  ]);
  await dataSource.initialize();
  await dataSource.destroy();
}
