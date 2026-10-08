import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ALL_ENTITIES } from './all-entities';

const SRC_DIR = join(__dirname, '..');

/** The `<kebab-name>.entity.ts` shape of the project's naming convention. */
const ENTITY_FILE_PATTERN = /^(.+)\.entity\.ts$/;

/**
 * Derives the entity class names from the `*.entity.ts` files on disk. By the
 * project convention (`.claude/rules/nestjs-common-conventions.md`) the file
 * `refresh-token.entity.ts` exports the class `RefreshToken`, so the directory
 * can be compared against `ALL_ENTITIES` without importing the entities.
 */
function readEntityClassNames(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .map((path) => ENTITY_FILE_PATTERN.exec(basename(path)))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, kebabName]) =>
      kebabName
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(''),
    )
    .sort();
}

describe('ALL_ENTITIES', () => {
  // Without this guard, forgetting to register a new entity would leave every
  // test data source building a schema without it, and the failure would show
  // up as a missing table/relation in a spec unrelated to the change.
  it('should register every *.entity.ts file under src/', () => {
    const expected = readEntityClassNames();

    expect(expected.length).toBeGreaterThan(0);
    expect(ALL_ENTITIES.map((entity) => entity.name).sort()).toEqual(expected);
  });
});
