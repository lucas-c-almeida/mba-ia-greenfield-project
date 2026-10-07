import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the schema self-sufficient: the `uuid_generate_v4()` defaults of the
 * later migrations come from the `uuid-ossp` extension, which until now was only
 * enabled as a side effect of the TypeORM Postgres driver reading entity
 * metadata (issue #54).
 *
 * The timestamp is deliberately one millisecond BEFORE
 * `CreateUsersAndChannels1775687773260`: migrations are immutable and TypeORM
 * runs pending migrations in timestamp order, so this is the only way to create
 * the extension ahead of the first `CREATE TABLE` on an empty database without
 * editing that migration. On databases already migrated it is a no-op
 * (`IF NOT EXISTS`) and is simply recorded as executed.
 */
export class EnableUuidOsspExtension1775687773259 implements MigrationInterface {
  name = 'EnableUuidOsspExtension1775687773259';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  }

  public async down(): Promise<void> {
    // Intentionally empty: the extension may predate this migration or be used
    // by objects it does not own (every `uuid_generate_v4()` default), so
    // dropping it on revert could break existing tables.
  }
}
