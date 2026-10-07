import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_MIGRATIONS } from './all-migrations';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

/** The `<timestamp>-<Name>.ts` shape the TypeORM CLI generates. */
const MIGRATION_FILE_PATTERN = /^(\d+)-(.+)\.ts$/;

interface MigrationFile {
  timestamp: number;
  className: string;
}

/**
 * Derives the migration class names from the files on disk, in execution
 * order. The CLI names the file `<timestamp>-<Name>.ts` for the class
 * `<Name><timestamp>`, so the directory can be compared against
 * `ALL_MIGRATIONS` without importing the migrations themselves.
 */
function readMigrationFiles(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => {
      const match = MIGRATION_FILE_PATTERN.exec(file);
      if (!match) {
        throw new Error(
          `"${file}" does not follow the <timestamp>-<Name>.ts convention the ` +
            `TypeORM CLI produces, so it cannot be matched against ALL_MIGRATIONS.`,
        );
      }
      const [, timestamp, name] = match;
      return {
        timestamp: Number(timestamp),
        className: `${name}${timestamp}`,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

describe('ALL_MIGRATIONS', () => {
  // Without this guard, forgetting to register a new migration would leave the
  // integration suites building an outdated schema with no error: the
  // assertion in `migrations.integration-spec.ts` compares the migrations that
  // ran against `ALL_MIGRATIONS` itself, so it shrinks along with the list.
  it('should register every file in migrations/, in timestamp order', () => {
    const expected = readMigrationFiles().map((file) => file.className);

    expect(expected.length).toBeGreaterThan(0);
    expect(ALL_MIGRATIONS.map((migration) => migration.name)).toEqual(expected);
  });
});
