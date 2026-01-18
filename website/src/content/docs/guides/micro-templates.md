---
title: Micro-Templates
description: Mix and match single-purpose components to build your stack
---

Micro-templates are single-purpose components you can add to existing StackSolo projects. Unlike full templates that scaffold entire applications, micro-templates let you pick exactly the pieces you need.

## Quick Start

```bash
# List all available micro-templates
stacksolo add --list

# Add a micro-template to your project
stacksolo add stripe-webhook

# Add with a name prefix (avoids conflicts)
stacksolo add auth-pages --name admin
```

## Available Micro-Templates

### Shells (Monorepo Foundations)

| ID | Description |
|----|-------------|
| `app-shell` | Monorepo foundation with Firebase Auth, Pinia stores, and feature-based architecture |

### Features (Add to Existing Shell)

| ID | Description |
|----|-------------|
| `feature-module` | Add a new feature package to an existing app-shell monorepo |

### Functions

| ID | Description |
|----|-------------|
| `stripe-webhook` | Handle Stripe webhook events (subscriptions, payments, etc.) |
| `stripe-checkout` | Create checkout sessions and customer portal links |
| `firebase-auth-api` | Auth middleware + profile endpoint with PostgreSQL sync |
| `chat-api` | AI chat endpoint with Vertex AI streaming (SSE) |

### UIs

| ID | Description |
|----|-------------|
| `landing-page` | Marketing landing page with hero, features, pricing |
| `auth-pages` | Login and signup pages with Firebase Authentication |
| `dashboard-layout` | Sidebar + header layout for authenticated dashboards |

## Shell Templates (Modular Apps)

Shell templates create monorepo foundations for larger applications with feature-driven development.

### Creating a Shell

```bash
# Initialize a new shell monorepo
stacksolo init --template app-shell --name myorg

# Install dependencies
cd my-app
pnpm install

# Run locally
pnpm --filter shell dev
```

### Shell Structure

```
packages/
├── shell/                    # Core Vue 3 app
│   ├── src/
│   │   ├── App.vue
│   │   ├── core/
│   │   │   ├── router/       # Dynamic feature route registration
│   │   │   ├── stores/       # Auth, navigation stores
│   │   │   └── layouts/      # ShellLayout.vue
│   │   └── pages/
│   │       └── Login.vue
│   └── package.json          # @myorg/shell
│
├── shared/                   # Shared components/stores
│   ├── src/
│   │   ├── components/       # Button, Card, LoadingSpinner
│   │   ├── composables/      # useCurrentUser
│   │   └── stores/           # notifications
│   └── package.json          # @myorg/shared
│
└── feature-dashboard/        # Default feature
    ├── src/
    │   ├── pages/
    │   ├── components/
    │   └── index.ts          # Exports routes + components
    └── package.json          # @myorg/feature-dashboard
```

### Adding Features

Use `stacksolo add feature-module` to add new feature packages:

```bash
# Add inventory feature
stacksolo add feature-module --name inventory

# Add reports feature
stacksolo add feature-module --name reports

# Add settings feature
stacksolo add feature-module --name settings
```

Each feature is automatically:
1. Created at `packages/feature-<name>/`
2. Added as a dependency in shell's `package.json`
3. Imported and registered in shell's router

### Feature Package Exports

Each feature exports routes for shell registration:

```typescript
// packages/feature-inventory/src/index.ts
import type { RouteRecordRaw } from 'vue-router';
import InventoryPage from './pages/InventoryPage.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/inventory',
    name: 'inventory',
    component: InventoryPage,
    meta: {
      title: 'Inventory',
      icon: 'package',
    },
  },
];

export { InventoryPage };
export { useInventoryStore } from './stores/inventory';
```

### Cross-Feature Communication

Features communicate via the shared package:

```vue
<script setup lang="ts">
import { Card, Button, useNotificationStore } from '@myorg/shared';

const notifications = useNotificationStore();

function handleSave() {
  // Save logic...
  notifications.show('Item saved!', 'success');
}
</script>
```

### Firebase Auth

The shell includes Firebase Authentication:
- Google sign-in
- Email/password
- Auth state persistence
- Protected routes

Configure in `packages/shell/src/core/lib/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  // ...
};
```

## Function & UI Micro-Templates

### How It Works

When you run `stacksolo add <micro-template-id>`:

1. **Downloads** the micro-template files from the community repository
2. **Copies** source files to your project (`functions/` or `apps/`)
3. **Merges** the config fragment into your `stacksolo.config.json`
4. **Shows** any required secrets you need to set up

### Example: Adding Stripe Payments

```bash
# Start with a basic project
stacksolo init my-saas

# Add Stripe webhook handling
stacksolo add stripe-webhook

# Add checkout session creation
stacksolo add stripe-checkout

# Set up secrets
echo "sk_live_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-

# Deploy
stacksolo deploy
```

### Example: Building a Dashboard

```bash
# Start with a basic project
stacksolo init my-dashboard

# Add auth pages for login/signup
stacksolo add auth-pages

# Add dashboard layout
stacksolo add dashboard-layout

# Deploy
stacksolo deploy
```

### Name Prefixes

Use `--name` to add a prefix when you need multiple instances or want to avoid conflicts:

```bash
# Add admin auth pages (creates apps/admin-auth/)
stacksolo add auth-pages --name admin

# Add user auth pages (creates apps/user-auth/)
stacksolo add auth-pages --name user
```

### Preview Changes

Use `--dry-run` to see what would be added without making changes:

```bash
stacksolo add stripe-webhook --dry-run
```

Output shows:
- Resources that will be added to config
- Files that will be copied
- Any conflicts with existing resources
- Required secrets

## Creating Your Own Micro-Templates

Micro-templates live in the [stacksolo-architectures](https://github.com/monkeybarrels/stacksolo-architectures) repository.

### Structure

```
micro-templates/<id>/
├── template.json      # Metadata and config
├── README.md          # Usage instructions
└── files/
    ├── functions/     # For function types
    │   └── <name>/
    ├── apps/          # For UI types
    │   └── <name>/
    └── packages/      # For shell/feature types
        └── <name>/
```

### Function Template

```json
{
  "id": "my-function",
  "name": "My Function",
  "type": "function",
  "description": "What it does",
  "variables": [],
  "secrets": ["my-secret"],
  "dependencies": {
    "some-package": "^1.0.0"
  },
  "config": {
    "function": {
      "name": "my-fn",
      "runtime": "nodejs20",
      "entryPoint": "handler",
      "memory": "256Mi",
      "sourceDir": "./functions/my-fn"
    }
  }
}
```

### Feature Template

```json
{
  "id": "feature-module",
  "name": "Feature Module",
  "type": "feature",
  "description": "Add a new feature package to an app-shell monorepo",
  "variables": [
    { "name": "name", "description": "Feature name (lowercase)", "required": true },
    { "name": "Name", "description": "Feature name (PascalCase)", "required": true },
    { "name": "org", "description": "npm organization scope", "default": "myorg" }
  ],
  "feature": {
    "sourceDir": "packages/feature-template",
    "targetDir": "packages/feature-{{name}}",
    "shellUpdates": {
      "packageJson": "@{{org}}/feature-{{name}}: workspace:*",
      "routerImport": "import { routes as {{name}}Routes } from '@{{org}}/feature-{{name}}';",
      "routerSpread": "...{{name}}Routes,"
    }
  }
}
```

### Contributing

1. Fork the [stacksolo-architectures](https://github.com/monkeybarrels/stacksolo-architectures) repository
2. Create your micro-template in `micro-templates/`
3. Add entry to `micro-templates.json`
4. Submit a pull request

## See Also

- [Templates Overview](/templates/overview) - Full project templates
- [CLI Reference](/reference/cli) - All CLI commands
