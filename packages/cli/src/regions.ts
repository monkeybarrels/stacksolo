/**
 * Cloud provider regions
 */

export interface RegionOption {
  value: string;
  name: string;
}

export const GCP_REGIONS: RegionOption[] = [
  { value: 'us-central1', name: 'us-central1 (Iowa)' },
  { value: 'us-east1', name: 'us-east1 (South Carolina)' },
  { value: 'us-east4', name: 'us-east4 (Virginia)' },
  { value: 'us-west1', name: 'us-west1 (Oregon)' },
  { value: 'us-west2', name: 'us-west2 (Los Angeles)' },
  { value: 'europe-west1', name: 'europe-west1 (Belgium)' },
  { value: 'europe-west2', name: 'europe-west2 (London)' },
  { value: 'europe-west3', name: 'europe-west3 (Frankfurt)' },
  { value: 'asia-east1', name: 'asia-east1 (Taiwan)' },
  { value: 'asia-northeast1', name: 'asia-northeast1 (Tokyo)' },
  { value: 'asia-southeast1', name: 'asia-southeast1 (Singapore)' },
  { value: 'australia-southeast1', name: 'australia-southeast1 (Sydney)' },
];

export interface ProviderOption {
  value: string;
  name: string;
  regions: RegionOption[];
}

export const PROVIDERS: ProviderOption[] = [
  { value: 'gcp', name: 'GCP (Google Cloud Platform)', regions: GCP_REGIONS },
  // AWS regions will be added when the AWS plugin is built
];

export function getRegionsForProvider(provider: string): RegionOption[] {
  const found = PROVIDERS.find((p) => p.value === provider);
  return found?.regions || [];
}
