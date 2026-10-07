> Part of the `testing-guide-nestjs-project` skill (see `../SKILL.md`).

# File Conventions

## Naming & Placement

| Layer | File Pattern | Location | Jest Config |
|---|---|---|---|
| **Unit** | `*.spec.ts` | Colocated with source in `src/` | `package.json` → `jest` section (rootDir: `src`, testRegex: `.*\.(spec|integration-spec)\.ts$`) |
| **Integration** | `*.integration-spec.ts` (hyphen before `spec`, never a dot) | Colocated with source in `src/` | Same `jest` section as unit (the two-alternative `testRegex` matches both); `npm run test:integration` selects only these via its own `--testRegex` |
| **E2E** | `*.e2e-spec.ts` | `test/` directory | `test/jest-e2e.json` (rootDir: `.`, testRegex: `.e2e-spec.ts$`) |

### Examples

```
src/
  users/
    users.service.ts
    users.service.spec.ts              # Unit test
    users.service.integration-spec.ts  # Integration test
    users.module.ts
    users.module.spec.ts               # Module compilation test
    user.entity.ts
    user.entity.integration-spec.ts    # Entity integration test
  auth/
    auth.service.ts
    auth.service.spec.ts               # Unit test
    auth.module.ts
    auth.module.spec.ts                # Module compilation test
test/
  users.e2e-spec.ts                    # E2E tests for /users
  auth.e2e-spec.ts                     # E2E tests for /auth
  channels.e2e-spec.ts                 # E2E tests for /channels
  videos.e2e-spec.ts                   # E2E tests for /videos
```

## Running Tests

All commands run inside the Docker container:

```bash
# Unit + integration tests (all *.spec.ts and *.integration-spec.ts in src/; not unit-only)
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm test

# Integration tests only (*.integration-spec.ts; already runs with --runInBand)
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm run test:integration

# Unit + integration tests in watch mode
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm run test:watch

# E2E tests
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm run test:e2e

# Coverage report
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm run test:cov

# Run specific test file
docker compose -f nestjs-project/compose.yaml exec nestjs-api npm test -- src/users/users.service.spec.ts
```

(If calling Jest directly, the Jest 30 flag is `--testPathPatterns`, plural; the singular `--testPathPattern` is rejected.)

## Coverage Targets (Thorough)

Since the team follows a **thorough** coverage philosophy:

| Metric | Target | Notes |
|---|---|---|
| **Statements** | >= 85% | Overall project target |
| **Branches** | >= 80% | Ensures conditional logic is tested |
| **Functions** | >= 85% | Every significant function should be tested |
| **Lines** | >= 85% | Consistent with statement coverage |

**Per-artifact expectations:**
- Services with branching: 90%+ branch coverage
- Entities: 100% constraint coverage (every unique, not-null, select:false tested)
- Controllers: 0% unit coverage (tested only via E2E)
- Modules with configured imports: 100% compilation coverage
- Guards: 100% of access control paths tested via E2E
- Exception filters: 100% of mapping rules tested

**What to exclude from coverage:**
Add to jest config `coveragePathIgnorePatterns`:
- `main.ts` — bootstrap file, not testable via unit/integration
- `*.module.ts` — modules are tested by compilation tests, not by line coverage
- `*.dto.ts` — DTOs are declarative; validation is tested via E2E
- `*.constants.ts` — static values, no behavior
- `dist/` — compiled output

## Jest Configuration

**Unit + Integration** (in `package.json`):
```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.(spec|integration-spec)\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node",
    "testTimeout": 30000,
    "setupFiles": ["dotenv/config"]
  }
}
```

**E2E** (in `test/jest-e2e.json`):
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testTimeout": 30000,
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "setupFiles": ["dotenv/config"],
  "globalSetup": "<rootDir>/global-setup.ts"
}
```

These mirror `nestjs-project/package.json` and `nestjs-project/test/jest-e2e.json`; see `nestjs-project/CLAUDE.md` → "Jest Configuration" for why each option is required.

## Test Structure

Follow Arrange-Act-Assert (AAA):
```typescript
it('should throw when user not found', async () => {
  // Arrange
  usersService.findByEmail.mockResolvedValue(null);

  // Act & Assert
  await expect(authService.login('no@user.com', 'pass'))
    .rejects.toThrow(EntityNotFoundException);
});
```

Use descriptive `describe` / `it` blocks:
- `describe('AuthService')` → `describe('login')` → `it('should throw when ...')`
- Name tests with "should" + expected behavior
- Group by method or scenario, not by test type
