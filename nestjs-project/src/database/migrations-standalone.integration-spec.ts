import { DataSource } from 'typeorm';
import { ALL_MIGRATIONS } from './all-migrations';

const SCRATCH_DATABASE = 'migrations_standalone_spec';

function connectionOptions(database: string) {
  return {
    type: 'postgres' as const,
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database,
  };
}

/**
 * Regression for issue #54: the migrations used to depend on the TypeORM
 * Postgres driver enabling `uuid-ossp` from entity metadata. This suite runs
 * them against a brand-new database, through a data source with NO entities,
 * so nothing but the migrations themselves can prepare the database.
 *
 * It uses its own scratch database: dropping/recreating the extension in the
 * shared test database would break the schema other suites rely on.
 */
describe('Migrations on a fresh database without entity metadata (integration)', () => {
  let admin: DataSource;
  let dataSource: DataSource;

  beforeAll(async () => {
    admin = new DataSource(
      connectionOptions(process.env.DB_NAME ?? 'streamtube'),
    );
    await admin.initialize();
    await admin.query(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}"`);
    await admin.query(`CREATE DATABASE "${SCRATCH_DATABASE}"`);

    dataSource = new DataSource({
      ...connectionOptions(SCRATCH_DATABASE),
      entities: [],
      synchronize: false,
      migrations: ALL_MIGRATIONS,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}"`);
    await admin?.destroy();
  });

  it('should start without the uuid-ossp extension', async () => {
    const extensions = await dataSource.query<{ extname: string }[]>(
      `SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'`,
    );

    expect(extensions).toHaveLength(0);
  });

  it('should apply every migration and enable uuid-ossp by itself', async () => {
    const ranMigrations = await dataSource.runMigrations();

    expect(ranMigrations).toHaveLength(ALL_MIGRATIONS.length);
    const extensions = await dataSource.query<{ extname: string }[]>(
      `SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'`,
    );
    expect(extensions).toHaveLength(1);
  });

  it('should generate ids through the uuid_generate_v4() column defaults', async () => {
    const [user] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO "users" ("email", "password") VALUES ('standalone@example.com', 'x') RETURNING "id"`,
    );

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
