import type { TestingModule } from '@nestjs/testing';

/**
 * Registers an `afterEach` that closes every `TestingModule` handed to the
 * tracker it returns, and returns that tracker.
 *
 * Call it once at file (or `describe`) scope and pass each module through it
 * the moment it is compiled:
 *
 * ```ts
 * const trackTestingModule = trackTestingModules();
 *
 * async function buildTestModule() {
 *   const module = trackTestingModule(
 *     await Test.createTestingModule({ ... }).compile(),
 *   );
 *   return { service: module.get(SomeService) };
 * }
 * ```
 *
 * Closing the module stops being the responsibility of whoever writes the
 * `describe`: the only way to obtain a tracker is to register the hook that
 * closes what it tracks, so a new block cannot be born without teardown.
 *
 * Lifecycle is unchanged: modules built inside a `beforeEach` are closed right
 * after that same test, so nothing is shared between tests.
 */
export function trackTestingModules(): <T extends TestingModule>(
  module: T,
) => T {
  const openModules = new Set<TestingModule>();

  afterEach(async () => {
    const modules = [...openModules];
    openModules.clear();
    await Promise.all(modules.map((module) => module.close()));
  });

  return (module) => {
    openModules.add(module);
    return module;
  };
}
