# @stacksolo/plugin-helm

Helm chart generator plugin for StackSolo. Transforms Kubernetes resource definitions into production-ready Helm charts with templatized values, enabling multi-environment deployments and GitOps workflows.

## Features

- **Automatic Helm Chart Generation** - Converts StackSolo K8s resources to complete Helm charts
- **Templatized Values** - All configurable values extracted to `values.yaml`
- **Multi-Deployment Support** - Single chart manages multiple deployments with individual configurations
- **Environment Flexibility** - Use values files for dev, staging, and production environments
- **Standard Helm Patterns** - Follows Helm best practices with `_helpers.tpl` and proper labeling

## Installation

The plugin is included with StackSolo by default. If installing separately:

```bash
npm install @stacksolo/plugin-helm
```

## Usage

### Generate a Helm Chart

```bash
# Preview the generated chart
stacksolo deploy --helm --preview

# Generate and deploy via Helm
stacksolo deploy --helm
```

### Project Configuration

Add Helm-specific settings in your `stacksolo.config.json`:

```json
{
  "project": {
    "name": "my-app",
    "backend": "kubernetes",
    "plugins": ["@stacksolo/plugin-helm"],
    "kubernetes": {
      "registry": {
        "url": "gcr.io/my-project"
      },
      "helm": {
        "chartVersion": "1.0.0",
        "appVersion": "v1.2.3"
      }
    }
  }
}
```

### Generated Chart Structure

```
.stacksolo/helm-chart/
├── Chart.yaml              # Chart metadata
├── values.yaml             # Default configuration values
└── templates/
    ├── _helpers.tpl        # Template helper functions
    ├── namespace.yaml      # Namespace resource
    ├── configmap.yaml      # ConfigMap for shared config
    ├── deployment.yaml     # Deployment resources (multi-deployment)
    ├── service.yaml        # Service resources
    └── ingress.yaml        # Ingress configuration
```

## Multi-Environment Deployments

### Create Environment-Specific Values Files

**values-dev.yaml**
```yaml
replicaCount: 1

deployments:
  api:
    replicaCount: 1
    image:
      tag: "dev-latest"
    resources:
      limits:
        cpu: 250m
        memory: 256Mi

ingress:
  host: "api.dev.example.com"
```

**values-staging.yaml**
```yaml
replicaCount: 2

deployments:
  api:
    replicaCount: 2
    image:
      tag: "staging-v1.2.0"
    resources:
      limits:
        cpu: 500m
        memory: 512Mi

ingress:
  host: "api.staging.example.com"
```

**values-prod.yaml**
```yaml
replicaCount: 3

deployments:
  api:
    replicaCount: 3
    image:
      tag: "v1.2.0"
    resources:
      limits:
        cpu: 1000m
        memory: 1Gi

ingress:
  host: "api.example.com"
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
```

### Deploy to Different Environments

```bash
# Development
helm install my-app .stacksolo/helm-chart \
  -f .stacksolo/helm-chart/values-dev.yaml \
  -n dev

# Staging
helm install my-app .stacksolo/helm-chart \
  -f .stacksolo/helm-chart/values-staging.yaml \
  -n staging

# Production
helm install my-app .stacksolo/helm-chart \
  -f .stacksolo/helm-chart/values-prod.yaml \
  -n production
```

### Upgrade Deployments

```bash
# Update image tag in production
helm upgrade my-app .stacksolo/helm-chart \
  -f .stacksolo/helm-chart/values-prod.yaml \
  --set deployments.api.image.tag=v1.3.0 \
  -n production
```

## Values Reference

### Global Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `replicaCount` | int | `1` | Default replica count for all deployments |
| `image.pullPolicy` | string | `IfNotPresent` | Image pull policy |
| `resources.limits.cpu` | string | `500m` | Default CPU limit |
| `resources.limits.memory` | string | `512Mi` | Default memory limit |
| `resources.requests.cpu` | string | `100m` | Default CPU request |
| `resources.requests.memory` | string | `128Mi` | Default memory request |

### Ingress Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ingress.enabled` | bool | `true` | Enable ingress resource |
| `ingress.className` | string | `nginx` | Ingress class name |
| `ingress.host` | string | - | Hostname for ingress |
| `ingress.annotations` | object | `{}` | Ingress annotations |
| `ingress.routes` | array | - | Path-based routing rules |

### Per-Deployment Configuration

Each deployment under `deployments.<name>`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `true` | Enable this deployment |
| `replicaCount` | int | global | Replica count override |
| `image.repository` | string | - | Container image repository |
| `image.tag` | string | `latest` | Container image tag |
| `port` | int | `8080` | Container port |
| `servicePort` | int | `80` | Service port |
| `env` | object | `{}` | Environment variables |
| `resources` | object | global | Resource limits/requests override |

## Advanced Usage

### Custom Helm Commands

After generating the chart, use standard Helm commands:

```bash
# Dry run to see generated manifests
helm template my-app .stacksolo/helm-chart

# Install with custom values
helm install my-app .stacksolo/helm-chart \
  --set deployments.api.replicaCount=5 \
  --set ingress.host=myapp.example.com

# Check release status
helm status my-app -n my-namespace

# View release history
helm history my-app -n my-namespace

# Rollback to previous version
helm rollback my-app 1 -n my-namespace

# Uninstall release
helm uninstall my-app -n my-namespace
```

### GitOps Integration

The generated Helm chart is compatible with GitOps tools:

**ArgoCD Application**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
spec:
  source:
    repoURL: https://github.com/myorg/myrepo
    path: .stacksolo/helm-chart
    helm:
      valueFiles:
        - values-prod.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: production
```

**Flux HelmRelease**
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: my-app
spec:
  chart:
    spec:
      chart: .stacksolo/helm-chart
      sourceRef:
        kind: GitRepository
        name: my-repo
  values:
    deployments:
      api:
        image:
          tag: v1.2.0
```

## Plugin Architecture

This plugin extends StackSolo's plugin system with the `OutputFormatter` capability:

```typescript
import type { Plugin } from '@stacksolo/core';
import { helmFormatter } from './formatter';

export const plugin: Plugin = {
  name: '@stacksolo/plugin-helm',
  version: '0.1.0',
  outputFormatters: [helmFormatter],
};
```

The `OutputFormatter` interface:

```typescript
interface OutputFormatter {
  id: string;           // 'helm'
  name: string;         // 'Helm Chart'
  description: string;
  generate: (options: OutputFormatterOptions) => GeneratedOutput[];
}

interface OutputFormatterOptions {
  projectName: string;
  resources: ResolvedResource[];
  config: Record<string, unknown>;
  outputDir: string;
}

interface GeneratedOutput {
  path: string;    // Relative path within chart
  content: string; // File content
}
```

## Contributing

See the main [StackSolo repository](https://github.com/monkeybarrels/stacksolo) for contribution guidelines.

## License

MIT - see [LICENSE](../../LICENSE) for details.
