import 'dotenv/config';
import { DataSource } from 'typeorm';
import databaseConfig from '../config/database.config';
import { ALL_MIGRATIONS } from './all-migrations';

const dbConfig = databaseConfig();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.name,
  synchronize: false,
  // Single authoritative migration list, shared with the test data sources
  // (`src/test/create-test-data-source.ts`), so the CLI runner and the
  // integration suites can never apply different sets of migrations.
  migrations: ALL_MIGRATIONS,
  // Entities stay a glob on purpose: it cannot go stale when a new entity is
  // added, whereas an explicit array would need the same manual upkeep (and
  // guard test) that `all-migrations.ts` needs — and a forgotten entity would
  // make `migration:generate` emit a wrong diff instead of failing. The glob is
  // relative to `process.cwd()`, which npm always sets to this package root for
  // the `migration:*` scripts and for `npm run seed`.
  entities: ['src/**/*.entity.ts'],
});
