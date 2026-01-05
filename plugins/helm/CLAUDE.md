# CLAUDE.md - Helm Plugin

This document provides context for Claude (AI assistant) when maintaining the Helm plugin.

## Plugin Overview

`@stacksolo/plugin-helm` is an output formatter plugin that generates Helm charts from StackSolo's resolved Kubernetes resources. It transforms the internal resource representation into a standard Helm chart structure with templatized values.

## Architecture

### Plugin Type: OutputFormatter

This plugin implements the `OutputFormatter` interface from `@stacksolo/core`:

```
OutputFormatterOptions (input)
    ├── projectName: string
    ├── resources: ResolvedResource[]
    ├── config: HelmChartConfig
    └── outputDir: string
            │
            ▼
    ┌─────────────────────┐
    │   helmFormatter     │
    │   (formatter.ts)    │
    └─────────────────────┘
            │
            ▼
GeneratedOutput[] (output)
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── _helpers.tpl
        ├── namespace.yaml
        ├── configmap.yaml
        ├── deployment.yaml
        ├── service.yaml
        └── ingress.yaml
```

### Directory Structure

```
plugins/helm/
├── src/
│   ├── index.ts           # Plugin export (entry point)
│   ├── formatter.ts       # OutputFormatter implementation
│   ├── types.ts           # HelmChartConfig, HelmValues, DeploymentValues
│   └── templates/
│       ├── index.ts       # Re-exports all template generators
│       ├── chart-yaml.ts  # Chart.yaml generator
│       ├── values-yaml.ts # values.yaml generator
│       ├── helpers-tpl.ts # _helpers.tpl generator
│       ├── namespace.ts   # namespace.yaml template
│       ├── configmap.ts   # configmap.yaml template
│       ├── deployment.ts  # deployment.yaml template
│       ├── service.ts     # service.yaml template
│       └── ingress.ts     # ingress.yaml template
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

## Key Files

### formatter.ts
Main orchestrator that calls all template generators and returns the complete chart as `GeneratedOutput[]`.

### templates/values-yaml.ts
Critical file that transforms `ResolvedResource[]` into Helm values structure. This is where:
- Deployments are extracted from resources with type `k8s:deployment`
- Services are matched to deployments
- Ingress routes are built from resources
- Default values are set

### templates/deployment.ts
Uses Helm range loops to generate multiple deployments from `values.deployments`:
```yaml
{{- range $name, $deployment := .Values.deployments }}
{{- if $deployment.enabled }}
# ... deployment spec
{{- end }}
{{- end }}
```

## Data Flow

1. **CLI invokes formatter**: `packages/cli/src/commands/infra/deploy.ts` loads the helm formatter via plugin-loader
2. **Resources are passed in**: Resolved K8s resources from `k8s-deploy.service.ts`
3. **Formatter generates files**: Each template generator produces content
4. **Files are written**: Deploy command writes to `.stacksolo/helm-chart/`

## Common Maintenance Tasks

### Adding a New Resource Template

1. Create `templates/new-resource.ts`:
```typescript
export function generateNewResourceTemplate(chartName: string): string {
  return `# Helm template content...`;
}
```

2. Export from `templates/index.ts`

3. Add to `formatter.ts`:
```typescript
outputs.push({
  path: 'templates/new-resource.yaml',
  content: generateNewResourceTemplate(chartName),
});
```

4. Update `values-yaml.ts` if the resource needs values

### Adding New Values Fields

1. Update `types.ts` with the new interface field
2. Update `templates/values-yaml.ts` to include the new field
3. Update relevant template files to use the new value

### Modifying Template Output

Each template file in `templates/` generates raw Helm template strings. When modifying:
- Test the output YAML is valid
- Ensure Helm template syntax is correct (e.g., `{{- ... }}` for trimming)
- Verify the template references exist in values.yaml

## Testing

Test with the example project:

```bash
# Build the plugin
cd plugins/helm && pnpm build

# Generate chart for example
cd examples/simple-api-k8s
stacksolo deploy --helm --preview

# Validate generated chart
helm lint .stacksolo/helm-chart
helm template test .stacksolo/helm-chart
```

## Dependencies

- `@stacksolo/core` - Provides `OutputFormatter` interface and types
- Uses TypeScript template literals for YAML generation (no external templating library)

## Integration Points

### With Core
- Implements `OutputFormatter` from `@stacksolo/core/types.ts`
- Registered via `outputFormatters` array in plugin export

### With CLI
- Loaded by `packages/cli/src/services/plugin-loader.service.ts`
- Invoked by `packages/cli/src/commands/infra/deploy.ts` when `--helm` flag is used

### With Blueprint
- Reads helm config from `kubernetes.helm` in the project schema
- Config defined in `packages/blueprint/src/schema.ts`

## Gotchas

1. **YAML Indentation**: Use template literals carefully. Helm templates are whitespace-sensitive.

2. **Helm Template Escaping**: When outputting `{{ }}` in generated templates, they're literal Helm syntax, not JavaScript template interpolation.

3. **Range Loops**: The deployment/service templates use `{{- range }}` to iterate over `values.deployments`. The `$` prefix (e.g., `$.Values`, `$.Release`) accesses root scope inside range.

4. **Label Selectors**: Deployment selector labels must match pod template labels exactly, or Kubernetes will reject the manifest.

## Version Compatibility

- Helm 3.x compatible (Helm 2 is deprecated)
- Kubernetes 1.19+ (uses `networking.k8s.io/v1` for Ingress)
- Node.js 18+
