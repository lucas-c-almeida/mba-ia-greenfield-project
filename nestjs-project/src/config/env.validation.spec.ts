import { envValidationSchema } from './env.validation';

const requiredEnv = {
  DB_USERNAME: 'user',
  DB_PASSWORD: 'pass',
  DB_NAME: 'db',
  JWT_SECRET: 'secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
};

interface ValidatedEnv {
  DB_HOST: string;
}

const validate = (env: Record<string, string>) => {
  const result = envValidationSchema.validate(
    { ...requiredEnv, ...env },
    { allowUnknown: true, abortEarly: false },
  );
  return { error: result.error, value: result.value as ValidatedEnv };
};

describe('envValidationSchema — DB_HOST', () => {
  it('should default DB_HOST to the Compose service name "db" when not set', () => {
    const { value, error } = validate({});

    expect(error).toBeUndefined();
    expect(value.DB_HOST).toBe('db');
  });

  it('should keep DB_HOST when it is set', () => {
    const { value, error } = validate({ DB_HOST: 'custom-db-host' });

    expect(error).toBeUndefined();
    expect(value.DB_HOST).toBe('custom-db-host');
  });
});
