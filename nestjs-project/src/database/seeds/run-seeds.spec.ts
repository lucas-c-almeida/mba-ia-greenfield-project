import type { DataSource } from 'typeorm';
import { NO_SEEDS_MESSAGE, runSeeds, type Seed } from './run-seeds';

describe('runSeeds', () => {
  let dataSource: { initialize: jest.Mock; destroy: jest.Mock };
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  const run = (seeds: readonly Seed[]) =>
    runSeeds(dataSource as unknown as DataSource, seeds);

  beforeEach(() => {
    dataSource = {
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('warns that nothing was seeded and touches nothing when the list is empty', async () => {
    await run([]);

    expect(warnSpy).toHaveBeenCalledWith(NO_SEEDS_MESSAGE);
    expect(dataSource.initialize).not.toHaveBeenCalled();
    expect(dataSource.destroy).not.toHaveBeenCalled();
  });

  it('runs every seed in order with the data source, then closes the connection', async () => {
    const calls: string[] = [];
    const first: Seed = jest.fn(() => {
      calls.push('first');
      return Promise.resolve();
    });
    const second: Seed = jest.fn(() => {
      calls.push('second');
      return Promise.resolve();
    });

    await run([first, second]);

    expect(calls).toEqual(['first', 'second']);
    expect(first).toHaveBeenCalledWith(dataSource);
    expect(second).toHaveBeenCalledWith(dataSource);
    expect(dataSource.initialize).toHaveBeenCalledTimes(1);
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Ran 2 seed(s)');
  });

  it('propagates a seed failure, skips later seeds and still destroys the connection', async () => {
    const failure = new Error('seed boom');
    const first: Seed = jest.fn().mockRejectedValue(failure);
    const second: Seed = jest.fn().mockResolvedValue(undefined);

    await expect(run([first, second])).rejects.toBe(failure);

    expect(second).not.toHaveBeenCalled();
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });
});
