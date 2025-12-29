import { describe, it, expect } from 'vitest';
import { validateConfig } from '../parser';
import type { StackSoloConfig } from '../schema';

describe('validateConfig', () => {
  describe('project validation', () => {
    it('should fail when project is missing', () => {
      const config = {} as StackSoloConfig;
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'project',
        message: 'project is required',
      });
    });

    it('should fail when project.name is missing', () => {
      const config: StackSoloConfig = {
        project: {
          name: '',
          region: 'us-central1',
          gcpProjectId: 'my-project',
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'project.name')).toBe(true);
    });

    it('should fail when project.name has invalid format', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'Invalid_Name',
          region: 'us-central1',
          gcpProjectId: 'my-project',
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'project.name' && e.message.includes('lowercase')
      )).toBe(true);
    });

    it('should pass with valid project config', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('bucket validation', () => {
    it('should fail when bucket name is missing', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          buckets: [{ name: '' }],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('buckets'))).toBe(true);
    });

    it('should fail when bucket name has invalid format', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          buckets: [{ name: 'ab' }], // Too short
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
    });

    it('should pass with valid bucket config', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          buckets: [
            { name: 'my-bucket', storageClass: 'STANDARD' },
          ],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
    });
  });

  describe('network validation', () => {
    it('should fail when network name is missing', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          networks: [{ name: '' }],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
    });

    it('should pass with valid network and containers', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          networks: [
            {
              name: 'main',
              containers: [
                { name: 'api', image: 'gcr.io/project/api:latest' },
              ],
            },
          ],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
    });
  });

  describe('cron validation', () => {
    it('should fail when cron schedule is missing', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          crons: [{ name: 'my-cron', schedule: '', target: 'main/api' }],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('schedule'))).toBe(true);
    });

    it('should pass with valid cron config', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          crons: [
            { name: 'daily-job', schedule: '0 0 * * *', target: 'main/api' },
          ],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
    });
  });

  describe('duplicate name detection', () => {
    it('should fail when bucket names are duplicated', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          buckets: [
            { name: 'my-bucket' },
            { name: 'my-bucket' },
          ],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('duplicate'))).toBe(true);
    });
  });

  describe('env reference validation', () => {
    it('should fail with invalid reference format', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          networks: [
            {
              name: 'main',
              containers: [
                {
                  name: 'api',
                  env: {
                    INVALID: '@invalid-format',
                  },
                },
              ],
            },
          ],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('reference'))).toBe(true);
    });

    it('should pass with valid reference format', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          buckets: [{ name: 'uploads' }],
          networks: [
            {
              name: 'main',
              containers: [
                {
                  name: 'api',
                  env: {
                    BUCKET: '@bucket/uploads.name',
                  },
                },
              ],
            },
          ],
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
    });
  });
});
