/**
 * Creates a `jest.Mock` typed after a real function/method signature.
 *
 * Mocks built as object-literal properties (`{ save: mockFn<Repo['save']>() }`)
 * are plain function-valued properties, so passing them to `expect(...)` is
 * safe under `@typescript-eslint/unbound-method` — unlike `jest.Mocked<T>`,
 * which keeps the original method declarations.
 */
export function mockFn<F extends (...args: any[]) => any>(): jest.Mock<
  ReturnType<F>,
  Parameters<F>
> {
  return jest.fn<ReturnType<F>, Parameters<F>>();
}
