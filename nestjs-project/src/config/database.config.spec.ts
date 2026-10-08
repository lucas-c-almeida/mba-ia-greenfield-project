import databaseConfig from './database.config';

describe('databaseConfig — DB_HOST', () => {
  const originalDbHost = process.env.DB_HOST;

  afterEach(() => {
    if (originalDbHost === undefined) {
      delete process.env.DB_HOST;
    } else {
      process.env.DB_HOST = originalDbHost;
    }
  });

  it('should default host to the Compose service name "db" when DB_HOST is not set', () => {
    delete process.env.DB_HOST;

    const config = databaseConfig();

    expect(config.host).toBe('db');
  });

  it('should use DB_HOST when it is set', () => {
    process.env.DB_HOST = 'custom-db-host';

    const config = databaseConfig();

    expect(config.host).toBe('custom-db-host');
  });
});
