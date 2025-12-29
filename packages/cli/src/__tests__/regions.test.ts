import { describe, it, expect } from 'vitest';
import {
  GCP_REGIONS,
  PROVIDERS,
  getRegionsForProvider,
  type RegionOption,
  type ProviderOption,
} from '../regions';

describe('GCP_REGIONS', () => {
  it('should have at least 10 regions', () => {
    expect(GCP_REGIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('should have us-central1 as a region', () => {
    const region = GCP_REGIONS.find((r) => r.value === 'us-central1');
    expect(region).toBeDefined();
    expect(region?.name).toContain('Iowa');
  });

  it('should have valid region format for all regions', () => {
    GCP_REGIONS.forEach((region) => {
      expect(region.value).toMatch(/^[a-z]+-[a-z]+\d+$/);
      expect(region.name).toContain(region.value);
      expect(region.name).toContain('(');
      expect(region.name).toContain(')');
    });
  });

  it('should include regions from major geographic areas', () => {
    const values = GCP_REGIONS.map((r) => r.value);

    // US regions
    expect(values.some((v) => v.startsWith('us-'))).toBe(true);

    // Europe regions
    expect(values.some((v) => v.startsWith('europe-'))).toBe(true);

    // Asia regions
    expect(values.some((v) => v.startsWith('asia-'))).toBe(true);

    // Australia regions
    expect(values.some((v) => v.startsWith('australia-'))).toBe(true);
  });
});

describe('PROVIDERS', () => {
  it('should have at least one provider', () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(1);
  });

  it('should have GCP as a provider', () => {
    const gcp = PROVIDERS.find((p) => p.value === 'gcp');
    expect(gcp).toBeDefined();
    expect(gcp?.name).toContain('Google Cloud');
  });

  it('should have regions for GCP provider', () => {
    const gcp = PROVIDERS.find((p) => p.value === 'gcp');
    expect(gcp?.regions.length).toBeGreaterThan(0);
    expect(gcp?.regions).toEqual(GCP_REGIONS);
  });

  it('should have valid provider format', () => {
    PROVIDERS.forEach((provider) => {
      expect(provider.value).toMatch(/^[a-z]+$/);
      expect(provider.name.length).toBeGreaterThan(0);
      expect(Array.isArray(provider.regions)).toBe(true);
    });
  });
});

describe('getRegionsForProvider', () => {
  it('should return GCP regions for gcp provider', () => {
    const regions = getRegionsForProvider('gcp');
    expect(regions).toEqual(GCP_REGIONS);
  });

  it('should return empty array for unknown provider', () => {
    const regions = getRegionsForProvider('unknown');
    expect(regions).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    const regions = getRegionsForProvider('');
    expect(regions).toEqual([]);
  });

  it('should be case sensitive', () => {
    const regions = getRegionsForProvider('GCP');
    expect(regions).toEqual([]);
  });
});
