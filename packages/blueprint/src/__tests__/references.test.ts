import { describe, it, expect } from 'vitest';
import {
  parseReference,
  isReference,
  getReferenceResourceId,
  getReferenceOutputName,
  resolveReferenceToPulumi,
  findEnvReferences,
  resolveEnvReferences,
} from '../references';

describe('parseReference', () => {
  it('should parse simple reference', () => {
    const ref = parseReference('@secret/api-key');

    expect(ref).toEqual({
      type: 'secret',
      name: 'api-key',
      property: undefined,
    });
  });

  it('should parse reference with property', () => {
    const ref = parseReference('@database/db.connectionString');

    expect(ref).toEqual({
      type: 'database',
      name: 'db',
      property: 'connectionString',
    });
  });

  it('should parse bucket reference', () => {
    const ref = parseReference('@bucket/uploads.url');

    expect(ref).toEqual({
      type: 'bucket',
      name: 'uploads',
      property: 'url',
    });
  });

  it('should parse cache reference', () => {
    const ref = parseReference('@cache/redis.host');

    expect(ref).toEqual({
      type: 'cache',
      name: 'redis',
      property: 'host',
    });
  });

  it('should return null for invalid reference', () => {
    expect(parseReference('not-a-reference')).toBeNull();
    expect(parseReference('@invalid')).toBeNull();
    expect(parseReference('@/missing-type')).toBeNull();
    expect(parseReference('')).toBeNull();
  });

  it('should return null for unknown type', () => {
    expect(parseReference('@unknown/name')).toBeNull();
  });
});

describe('isReference', () => {
  it('should return true for valid references', () => {
    expect(isReference('@secret/api-key')).toBe(true);
    expect(isReference('@database/db.connectionString')).toBe(true);
    expect(isReference('@bucket/uploads')).toBe(true);
  });

  it('should return false for non-references', () => {
    expect(isReference('plain-value')).toBe(false);
    expect(isReference('${some.var}')).toBe(false);
    expect(isReference('@invalid')).toBe(false);
  });
});

describe('getReferenceResourceId', () => {
  it('should generate correct resource ID', () => {
    expect(getReferenceResourceId({ type: 'secret', name: 'api-key' })).toBe('secret-api-key');
    expect(getReferenceResourceId({ type: 'database', name: 'db' })).toBe('database-db');
    expect(getReferenceResourceId({ type: 'bucket', name: 'uploads' })).toBe('bucket-uploads');
  });
});

describe('getReferenceOutputName', () => {
  it('should return default output when no property specified', () => {
    expect(getReferenceOutputName({ type: 'secret', name: 'api-key' })).toBe('secretId');
    expect(getReferenceOutputName({ type: 'database', name: 'db' })).toBe('connectionString');
    expect(getReferenceOutputName({ type: 'bucket', name: 'uploads' })).toBe('name');
    expect(getReferenceOutputName({ type: 'cache', name: 'redis' })).toBe('host');
    expect(getReferenceOutputName({ type: 'container', name: 'api' })).toBe('url');
  });

  it('should return correct output for property', () => {
    expect(getReferenceOutputName({ type: 'database', name: 'db', property: 'privateIp' })).toBe('privateIp');
    expect(getReferenceOutputName({ type: 'bucket', name: 'uploads', property: 'url' })).toBe('url');
    expect(getReferenceOutputName({ type: 'cache', name: 'redis', property: 'port' })).toBe('port');
  });

  it('should throw for unknown property', () => {
    expect(() => getReferenceOutputName({ type: 'secret', name: 'x', property: 'unknown' })).toThrow();
  });
});

describe('resolveReferenceToPulumi', () => {
  it('should resolve secret reference', () => {
    const result = resolveReferenceToPulumi({ type: 'secret', name: 'api-key' });
    expect(result).toBe('${api_keySecretId}');
  });

  it('should resolve database connection string', () => {
    const result = resolveReferenceToPulumi({ type: 'database', name: 'db', property: 'connectionString' });
    expect(result).toBe('${dbConnectionString}');
  });

  it('should resolve bucket name', () => {
    const result = resolveReferenceToPulumi({ type: 'bucket', name: 'uploads', property: 'name' });
    expect(result).toBe('${uploadsName}');
  });

  it('should handle hyphenated names', () => {
    const result = resolveReferenceToPulumi({ type: 'secret', name: 'my-api-key' });
    expect(result).toBe('${my_api_keySecretId}');
  });
});

describe('findEnvReferences', () => {
  it('should find all references in env object', () => {
    const env = {
      API_KEY: '@secret/api-key',
      DATABASE_URL: '@database/db.connectionString',
      PLAIN_VALUE: 'not-a-reference',
      BUCKET: '@bucket/uploads.name',
    };

    const refs = findEnvReferences(env);

    expect(refs).toHaveLength(3);
    expect(refs.map(r => r.type)).toContain('secret');
    expect(refs.map(r => r.type)).toContain('database');
    expect(refs.map(r => r.type)).toContain('bucket');
  });

  it('should return empty array when no references', () => {
    const env = {
      NODE_ENV: 'production',
      PORT: '8080',
    };

    const refs = findEnvReferences(env);

    expect(refs).toHaveLength(0);
  });
});

describe('resolveEnvReferences', () => {
  it('should resolve all references in env object', () => {
    const env = {
      API_KEY: '@secret/api-key',
      PLAIN: 'plain-value',
    };

    const resolved = resolveEnvReferences(env);

    expect(resolved.API_KEY).toBe('${api_keySecretId}');
    expect(resolved.PLAIN).toBe('plain-value');
  });

  it('should keep invalid references as-is', () => {
    const env = {
      INVALID: '@not-valid',
    };

    const resolved = resolveEnvReferences(env);

    expect(resolved.INVALID).toBe('@not-valid');
  });
});
