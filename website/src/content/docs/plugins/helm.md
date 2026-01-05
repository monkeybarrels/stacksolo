---
title: Helm Plugin
description: Generate Helm charts from Kubernetes configurations
---

The `@stacksolo/plugin-helm` transforms Kubernetes resource definitions into production-ready Helm charts, enabling multi-environment deployments and GitOps workflows.

## Quick Start

```bash
# Generate Helm chart (preview)
stacksolo deploy --helm --preview

# Generate and deploy via Helm
stacksolo deploy --helm
```

## Configuration

Add Helm settings in your `stacksolo.config.json`:

```json
{
  "project": {
    "backend": "kubernetes",
    "kubernetes": {
      "helm": {
        "chartVersion": "1.0.0",
        "appVersion": "v1.2.3"
      }
    }
  }
}
```

## Generated Chart Structure

```
.stacksolo/helm-chart/
├── Chart.yaml              # Chart metadata
├── values.yaml             # Default values
└── templates/
    ├── _helpers.tpl        # Template helpers
    ├── namespace.yaml
    ├── configmap.yaml
    ├── deployment.yaml
    ├── service.yaml
    └── ingress.yaml
```

## Multi-Environment Deployments

Create environment-specific values files:

**values-dev.yaml**
```yaml
replicaCount: 1
deployments:
  api:
    image:
      tag: "dev-latest"
ingress:
  host: "api.dev.example.com"
```

**values-prod.yaml**
```yaml
replicaCount: 3
deployments:
  api:
    image:
      tag: "v1.2.0"
    resources:
      limits:
        cpu: 1000m
        memory: 1Gi
ingress:
  host: "api.example.com"
```

Deploy to environments:

```bash
# Development
helm install myapp .stacksolo/helm-chart \
  -f values-dev.yaml -n dev

# Production
helm install myapp .stacksolo/helm-chart \
  -f values-prod.yaml -n production
```

## Values Reference

### Global

| Key | Default | Description |
|-----|---------|-------------|
| `replicaCount` | `1` | Default replicas |
| `image.pullPolicy` | `IfNotPresent` | Pull policy |
| `resources.limits.cpu` | `500m` | CPU limit |
| `resources.limits.memory` | `512Mi` | Memory limit |

### Ingress

| Key | Default | Description |
|-----|---------|-------------|
| `ingress.enabled` | `true` | Enable ingress |
| `ingress.className` | `nginx` | Ingress class |
| `ingress.host` | - | Hostname |
| `ingress.annotations` | `{}` | Annotations |

### Per-Deployment

Under `deployments.<name>`:

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable deployment |
| `image.repository` | - | Image repository |
| `image.tag` | `latest` | Image tag |
| `port` | `8080` | Container port |
| `env` | `{}` | Environment vars |

## Common Commands

```bash
# Preview generated manifests
helm template myapp .stacksolo/helm-chart

# Upgrade with new image
helm upgrade myapp .stacksolo/helm-chart \
  --set deployments.api.image.tag=v2.0.0

# Rollback
helm rollback myapp 1

# Uninstall
helm uninstall myapp
```

## GitOps Integration

**ArgoCD**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
spec:
  source:
    path: .stacksolo/helm-chart
    helm:
      valueFiles:
        - values-prod.yaml
```

**Flux**
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: myapp
spec:
  chart:
    spec:
      chart: .stacksolo/helm-chart
```

## Learn More

- [Source code](https://github.com/monkeybarrels/stacksolo/tree/main/plugins/helm)
- [Plugin README](https://github.com/monkeybarrels/stacksolo/blob/main/plugins/helm/README.md)
- [Deployment Guide](/guides/deployment/)
