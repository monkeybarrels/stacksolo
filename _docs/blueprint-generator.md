# StackSolo Blueprint Generator Implementation Plan

## Overview
Create a declarative JSON-based blueprint system that replaces the current TypeScript-only pattern definitions. This allows non-developers to create infrastructure blueprints via JSON, which get compiled to TypeScript at build time.

## Current State Analysis
- **Existing System**: `AppPattern` interface in `packages/core/src/types.ts` with `defineAppPattern()` helper
- **Current Patterns**: TypeScript files in `plugins/gcp/src/patterns/` (nextjs-cloud-run, sveltekit-cloud-run)
- **Limitation**: Requires TypeScript knowledge to create new patterns

---

## Implementation Tasks

### Phase 1: Core Types & Schema
- [ ] Define `Blueprint` interface in `packages/core/src/types.ts`
  - JSON-serializable version of `AppPattern`
  - Add `confidence` function support
  - Add `configSections` for typed config generation
- [ ] Create JSON Schema for blueprint validation (`packages/core/src/schema/blueprint.schema.json`)
- [ ] Add `defineBlueprint()` helper to `packages/core/src/define.ts`

### Phase 2: Blueprint Compiler
- [ ] Create `packages/core/src/blueprint/compiler.ts`
  - Parse JSON blueprint definition
  - Generate `detect()` function from declarative rules
  - Generate `confidence()` function from detection criteria
  - Handle `${answers.x}` and `${resources.x}` template interpolation
  - Handle conditional infrastructure (`when` clauses)
- [ ] Create `packages/core/src/blueprint/templates.ts`
  - Dockerfile templates (nextjs, node, python, vite-react)
  - Common build configurations

### Phase 3: CLI Commands
- [ ] Add `blueprint:create` command to `packages/cli/src/commands/`
  - `--input <file>` - Create from JSON file
  - `--interactive` - Create via prompts
  - `--output <dir>` - Output directory (default: `plugins/gcp/src/blueprints/`)
- [ ] Add `blueprint:validate` command
  - Validate JSON against schema
  - Check resource type references
- [ ] Add `blueprint:list` command
  - List all registered blueprints

### Phase 4: Built-in Blueprints
- [ ] Create `plugins/gcp/src/blueprints/` directory
- [ ] Convert existing patterns to blueprints:
  - `nextjs-cloudrun.json` → `nextjs-cloudrun.ts`
  - `sveltekit-cloudrun.json` → `sveltekit-cloudrun.ts`
- [ ] Create new blueprints:
  - `react-vite-static.json` - Static site with CDN
  - `react-vite-cloudfunction.json` - React + Cloud Function API

### Phase 5: Integration
- [ ] Update `packages/core/src/registry.ts` to handle both patterns and blueprints
- [ ] Update plugin loading to auto-compile JSON blueprints
- [ ] Update CLI `init` command to use blueprints
- [ ] Update API pattern detection to include blueprints

---

## File Structure After Implementation

```
packages/
├── core/
│   └── src/
│       ├── blueprint/
│       │   ├── compiler.ts      # JSON → TypeScript compiler
│       │   ├── templates.ts     # Dockerfile templates
│       │   └── index.ts
│       ├── schema/
│       │   └── blueprint.schema.json
│       └── types.ts             # Add Blueprint interface
│
├── cli/
│   └── src/
│       └── commands/
│           └── blueprint.ts     # blueprint:create, validate, list
│
plugins/
└── gcp/
    └── src/
        ├── blueprints/          # JSON definitions
        │   ├── nextjs-cloudrun.json
        │   ├── react-vite-static.json
        │   └── react-vite-cloudfunction.json
        └── patterns/            # Keep for backwards compat
```

---

## Key Type Definitions

```typescript
// Blueprint JSON Schema (packages/core/src/types.ts)
interface BlueprintDefinition {
  id: string;
  name: string;
  description: string;

  detect: {
    files?: string[];           // Files that must exist
    dependencies?: string[];    // package.json dependencies
    devDependencies?: string[]; // package.json devDependencies
  };

  prompts?: BlueprintPrompt[];

  infrastructure: BlueprintResource[];

  build?: {
    docker?: { generate: boolean; template: string };
    steps?: BuildStep[];
  };

  env?: Record<string, string>;
  configSections?: Record<string, unknown>;
}

interface BlueprintPrompt {
  id: string;
  type: 'text' | 'confirm' | 'select';
  label: string;
  default?: unknown;
  options?: string[];
  when?: string;  // Condition expression
}

interface BlueprintResource {
  type: string;
  name: string;
  config: Record<string, unknown>;
  when?: string;  // Condition expression
}
```

---

## Template Interpolation

Support for dynamic values in JSON:
- `${answers.apiDir}` - User prompt answers
- `${resources.api.url}` - Resource outputs
- `${project.name}` - Project metadata

---

## Migration Strategy

1. Keep existing `AppPattern` system working
2. Add `Blueprint` as alternative definition format
3. Blueprints compile to patterns at registration time
4. Eventually deprecate direct TypeScript patterns

---

## Example Blueprint JSON

```json
{
  "id": "gcp:react-vite-cloudfunction",
  "name": "React + Vite with Cloud Function API",
  "description": "Static React frontend with serverless backend",

  "detect": {
    "files": ["vite.config.ts", "vite.config.js"],
    "dependencies": ["react", "vite"]
  },

  "prompts": [
    {
      "id": "apiDir",
      "type": "text",
      "label": "Path to Cloud Function code",
      "default": "./api"
    }
  ],

  "infrastructure": [
    {
      "type": "gcp:storage_bucket",
      "name": "frontend",
      "config": { "website": true }
    },
    {
      "type": "gcp:cloud_function",
      "name": "api",
      "config": { "sourceDir": "${answers.apiDir}" }
    }
  ],

  "build": {
    "steps": [
      { "name": "frontend", "command": "npm run build", "outputDir": "dist" },
      { "name": "api", "command": "npm run build", "workingDir": "${answers.apiDir}" }
    ]
  },

  "env": {
    "VITE_API_URL": "${resources.api.url}"
  }
}
```

---

## CLI Usage

```bash
# Create from JSON file
npx stacksolo blueprint:create --input blueprint.json

# Create interactively
npx stacksolo blueprint:create --interactive

# Validate a blueprint JSON
npx stacksolo blueprint:validate --input blueprint.json

# List available blueprints
npx stacksolo blueprint:list
```
