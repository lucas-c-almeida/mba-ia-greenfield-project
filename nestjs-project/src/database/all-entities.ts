import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';

/**
 * Every entity of the project.
 *
 * This is the single authoritative list for the test data sources: the unit,
 * integration and e2e suites pass it to `createTestDataSource` instead of
 * redeclaring it per spec. Explicit classes are the only reliable form under
 * `ts-jest`, which does not resolve TypeORM's glob patterns inside the Jest
 * sandbox (see `.claude/rules/typeorm-migrations.md`).
 *
 * Add every new entity here — otherwise the test data sources build a schema
 * without it. `all-entities.spec.ts` enforces that this list matches the
 * `*.entity.ts` files in `src/`, so a forgotten registration fails the suite.
 *
 * The runtime `data-source.ts` deliberately does NOT consume this list: it keeps
 * its entities glob, which cannot go stale when an entity is added, whereas a
 * forgotten array entry would make `migration:generate` emit a wrong diff.
 */
export const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken];
