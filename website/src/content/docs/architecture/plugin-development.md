---
title: Plugin Development
description: How to create StackSolo plugins
---

Plugins extend StackSolo with new resource types and providers.

## Plugin Structure

```
my-plugin/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts        # Plugin entry point
    └── resources/
        └── my-resource.ts
```

## Plugin Interface

```typescript
// src/index.ts
import { StackSoloPlugin } from '@stacksolo/core';
import { myResource } from './resources/my-resource';

const plugin: StackSoloPlugin = {
  name: 'my-plugin',
  version: '0.1.0',
  resources: [myResource],
};

export default plugin;
```

## Resource Definition

```typescript
// src/resources/my-resource.ts
import { defineResource } from '@stacksolo/core';

export const myResource = defineResource({
  id: 'my-plugin:my-resource',
  name: 'My Resource',

  configSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      // ... JSON Schema
    },
    required: ['name'],
  },

  generate(config, context) {
    return {
      imports: ['import { Something } from "cdktf"'],
      code: `new Something(stack, '${config.name}', { ... })`,
      outputs: ['url'],
    };
  },
});
```

## Build Configuration

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  external: ['@stacksolo/core'],
  dts: true,
});
```

## Package Setup

```json
{
  "name": "@my-org/stacksolo-plugin-example",
  "type": "module",
  "main": "dist/index.js",
  "peerDependencies": {
    "@stacksolo/core": "^0.1.0"
  }
}
```

## Using Your Plugin

```json
{
  "project": {
    "plugins": ["@my-org/stacksolo-plugin-example"],
    "networks": [{
      "myResources": [{ "name": "example" }]
    }]
  }
}
```

## Learn More

- [Existing plugins](https://github.com/monkeybarrels/stacksolo/tree/main/plugins)
- [@stacksolo/core source](https://github.com/monkeybarrels/stacksolo/tree/main/packages/core)
