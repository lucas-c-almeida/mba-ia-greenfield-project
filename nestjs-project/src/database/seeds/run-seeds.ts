import type { DataSource } from 'typeorm';

export type Seed = (dataSource: DataSource) => Promise<void>;

export const NO_SEEDS_MESSAGE = 'No seeds registered — nothing was seeded';

export async function runSeeds(
  dataSource: DataSource,
  seeds: readonly Seed[],
): Promise<void> {
  if (seeds.length === 0) {
    console.warn(NO_SEEDS_MESSAGE);
    return;
  }

  await dataSource.initialize();
  console.log('Database connection initialized');

  try {
    for (const seed of seeds) {
      await seed(dataSource);
    }
    console.log(`Ran ${seeds.length} seed(s)`);
  } finally {
    await dataSource.destroy();
    console.log('Database connection closed');
  }
}
