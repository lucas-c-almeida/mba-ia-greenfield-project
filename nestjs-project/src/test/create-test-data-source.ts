import { DataSource, type DataSourceOptions } from 'typeorm';
import { ALL_MIGRATIONS } from '../database/all-migrations';

interface TestDataSourceOptions {
  /**
   * Build the schema by running the project's migrations when the data source
   * is initialized. Defaults to `true` so integration suites exercise the same
   * schema path as production. Suites that drive the migration runner
   * themselves (applying/reverting) pass `false` and call `runMigrations()` on
   * their own.
   */
  runMigrations?: boolean;
}

export function createTestDataSource(
  entities: NonNullable<DataSourceOptions['entities']>,
  options: TestDataSourceOptions = {},
): DataSource {
  const { runMigrations = true } = options;
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database: process.env.DB_DATABASE ?? 'streamtube',
    entities,
    // Never synchronize: TypeORM's schema builder issues concurrent query()
    // calls on a single pg client (a DeprecationWarning today, a hard failure
    // on pg@9) and it is not the schema path production uses.
    synchronize: false,
    migrations: ALL_MIGRATIONS,
    migrationsRun: runMigrations,
  });
}

export async function cleanAllTables(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM "refresh_tokens"');
  await dataSource.query('DELETE FROM "verification_tokens"');
  await dataSource.query('DELETE FROM "channels"');
  await dataSource.query('DELETE FROM "users"');
}
