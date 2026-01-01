/**
 * Docker Compose generator
 * Generates docker-compose.yml from config for local development
 */

import type {
  StackSoloConfig,
  DatabaseConfig,
  CacheConfig,
  KernelConfig,
} from '@stacksolo/blueprint';
import type { DockerComposeConfig, DockerService, GeneratedFile } from './types';

interface DockerGeneratorResult {
  dockerCompose: GeneratedFile | null;
  services: string[];
}

/**
 * Generate docker-compose.yml from config
 */
export function generateDockerCompose(config: StackSoloConfig): DockerGeneratorResult {
  const services: Record<string, DockerService> = {};
  const volumes: Record<string, { driver?: string }> = {};
  const serviceNames: string[] = [];

  // Generate kernel service if configured
  if (config.project.kernel) {
    const service = generateKernelService(config.project.kernel, config.project.gcpProjectId);
    services[service.name] = service;
    serviceNames.push(service.name);
    volumes['kernel_data'] = {};
  }

  // Collect databases and caches from networks
  for (const network of config.project.networks || []) {
    for (const db of network.databases || []) {
      const service = generateDatabaseService(db);
      if (service) {
        services[service.name] = service;
        serviceNames.push(service.name);
        volumes[`${service.name}_data`] = {};
      }
    }

    for (const cache of network.caches || []) {
      const service = generateCacheService(cache);
      if (service) {
        services[service.name] = service;
        serviceNames.push(service.name);
      }
    }
  }

  // Only generate if we have services
  if (Object.keys(services).length === 0) {
    return { dockerCompose: null, services: [] };
  }

  const composeConfig: DockerComposeConfig = {
    version: '3.8',
    services,
    ...(Object.keys(volumes).length > 0 ? { volumes } : {}),
  };

  const content = generateDockerComposeYaml(composeConfig);

  return {
    dockerCompose: { path: '.stacksolo/docker-compose.yml', content },
    services: serviceNames,
  };
}

function generateDatabaseService(db: DatabaseConfig): DockerService | null {
  const isPostgres = db.databaseVersion?.startsWith('POSTGRES') ?? true;
  const dbName = db.databaseName || 'app';
  const serviceName = db.name.replace(/-/g, '_');

  if (isPostgres) {
    const version = extractPostgresVersion(db.databaseVersion);
    return {
      name: serviceName,
      image: `postgres:${version}`,
      environment: {
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
        POSTGRES_DB: dbName,
      },
      ports: ['5432:5432'],
      volumes: [`${serviceName}_data:/var/lib/postgresql/data`],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U postgres'],
        interval: '10s',
        timeout: '5s',
        retries: 5,
      },
    };
  } else {
    // MySQL
    const version = extractMySqlVersion(db.databaseVersion);
    return {
      name: serviceName,
      image: `mysql:${version}`,
      environment: {
        MYSQL_ROOT_PASSWORD: 'mysql',
        MYSQL_DATABASE: dbName,
      },
      ports: ['3306:3306'],
      volumes: [`${serviceName}_data:/var/lib/mysql`],
      healthcheck: {
        test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
        interval: '10s',
        timeout: '5s',
        retries: 5,
      },
    };
  }
}

function generateCacheService(cache: CacheConfig): DockerService {
  const serviceName = cache.name.replace(/-/g, '_');
  const version = cache.redisVersion || '7';

  return {
    name: serviceName,
    image: `redis:${version}-alpine`,
    ports: ['6379:6379'],
    healthcheck: {
      test: ['CMD', 'redis-cli', 'ping'],
      interval: '10s',
      timeout: '5s',
      retries: 5,
    },
  };
}

function generateKernelService(kernel: KernelConfig, gcpProjectId: string): DockerService {
  const serviceName = kernel.name.replace(/-/g, '_');

  return {
    name: serviceName,
    image: `${serviceName}:dev`,
    build: {
      context: `../containers/${kernel.name}`,
      dockerfile: 'Dockerfile',
    },
    environment: {
      NODE_ENV: 'development',
      HTTP_PORT: '8080',
      NATS_URL: 'nats://localhost:4222',
      FIREBASE_PROJECT_ID: kernel.firebaseProjectId || `demo-${gcpProjectId}`,
      ...(kernel.gcsBucket ? { GCS_BUCKET: kernel.gcsBucket } : {}),
      ...(kernel.env || {}),
    },
    ports: ['8090:8080', '4222:4222'],
    volumes: ['kernel_data:/data'],
    healthcheck: {
      test: ['CMD', 'wget', '--spider', '-q', 'http://localhost:8080/health'],
      interval: '10s',
      timeout: '5s',
      retries: 3,
    },
  };
}

function extractPostgresVersion(version?: string): string {
  if (!version) return '15';
  const match = version.match(/POSTGRES_(\d+)/);
  return match ? match[1] : '15';
}

function extractMySqlVersion(version?: string): string {
  if (!version) return '8.0';
  if (version.includes('8_0')) return '8.0';
  if (version.includes('5_7')) return '5.7';
  return '8.0';
}

function generateDockerComposeYaml(config: DockerComposeConfig): string {
  const lines: string[] = [
    '# StackSolo Local Development Services',
    '# Generated by: stacksolo scaffold',
    '#',
    '# Usage:',
    '#   docker-compose up -d    Start all services',
    '#   docker-compose down     Stop all services',
    '#   docker-compose logs -f  View logs',
    '',
  ];

  lines.push(`version: '${config.version}'`);
  lines.push('');
  lines.push('services:');

  for (const [name, service] of Object.entries(config.services)) {
    lines.push(`  ${name}:`);

    if (service.build) {
      lines.push('    build:');
      lines.push(`      context: ${service.build.context}`);
      lines.push(`      dockerfile: ${service.build.dockerfile}`);
    }

    lines.push(`    image: ${service.image}`);

    if (service.environment && Object.keys(service.environment).length > 0) {
      lines.push('    environment:');
      for (const [key, value] of Object.entries(service.environment)) {
        lines.push(`      ${key}: ${value}`);
      }
    }

    if (service.ports && service.ports.length > 0) {
      lines.push('    ports:');
      for (const port of service.ports) {
        lines.push(`      - "${port}"`);
      }
    }

    if (service.volumes && service.volumes.length > 0) {
      lines.push('    volumes:');
      for (const volume of service.volumes) {
        lines.push(`      - ${volume}`);
      }
    }

    if (service.healthcheck) {
      lines.push('    healthcheck:');
      lines.push(`      test: ${JSON.stringify(service.healthcheck.test)}`);
      lines.push(`      interval: ${service.healthcheck.interval}`);
      lines.push(`      timeout: ${service.healthcheck.timeout}`);
      lines.push(`      retries: ${service.healthcheck.retries}`);
    }

    if (service.depends_on && service.depends_on.length > 0) {
      lines.push('    depends_on:');
      for (const dep of service.depends_on) {
        lines.push(`      - ${dep}`);
      }
    }

    lines.push('');
  }

  if (config.volumes && Object.keys(config.volumes).length > 0) {
    lines.push('volumes:');
    for (const name of Object.keys(config.volumes)) {
      lines.push(`  ${name}:`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
