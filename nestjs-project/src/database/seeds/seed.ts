import { AppDataSource } from '../data-source';
import { REGISTERED_SEEDS } from './registered-seeds';
import { runSeeds } from './run-seeds';

runSeeds(AppDataSource, REGISTERED_SEEDS).catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
